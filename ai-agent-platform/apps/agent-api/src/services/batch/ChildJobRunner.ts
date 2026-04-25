import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import type { AiConfig, AiUsageSummary } from '@ai-agent/shared-types';
import { AGENT_CORE_PATH, JOBS_BASE_DIR } from '../../config';
import { runtimeConfig } from '../../config/runtime.config';
import { JobEntity } from '../../domain/Job';
import { jobStore } from '../JobStore';

const CHILD_JOB_TIMEOUT_MS = 20 * 60 * 1000;

/** Patterns that indicate Playwright's Linux system deps are missing. */
const MISSING_DEPS_PATTERNS = [
  /error while loading shared libraries/i,
  /libatk/i,
  /libgdk/i,
  /libglib/i,
  /libnss/i,
  /Executable doesn't exist/i,
  /browserType\.launch/i,
];

function isMissingDepsError(text: string): boolean {
  return MISSING_DEPS_PATTERNS.some((p) => p.test(text));
}

export interface ChildRunResult {
  childId: string;
  exitCode: number;
  durationMs: number;
  attempts: number;
  aiUsage?: AiUsageSummary;
}

export class ChildJobRunner {
  async run(
    job: JobEntity,
    childId: string,
    childFilePath: string,
    aiConfig?: AiConfig,
    attempt = 1,
  ): Promise<ChildRunResult> {
    const childDir = path.join(JOBS_BASE_DIR, job.jobId, 'children', childId);
    const outputDir = path.join(childDir, 'generated');
    const aiUsagePath = path.join(childDir, 'ai-usage.json');
    const logsFile = path.join(JOBS_BASE_DIR, job.jobId, 'logs.txt');
    fs.mkdirSync(outputDir, { recursive: true });

    const started = Date.now();

    const args = [
      AGENT_CORE_PATH,
      'generate',
      '--file', childFilePath,
      '--url', job.url,
      '--output', outputDir,
      '--headless', String(job.headless),
    ];

    return new Promise<ChildRunResult>((resolve, reject) => {
      let timedOut = false;
      const child = spawn('node', args, {
        shell: false,
        env: {
          ...process.env,
          PLAYWRIGHT_BROWSERS_PATH: runtimeConfig.PLAYWRIGHT_BROWSERS_PATH,
          HEADLESS: String(job.headless),
          AI_ENABLED: String((aiConfig?.provider ?? 'none') !== 'none'),
          AI_PROVIDER: aiConfig?.provider ?? 'none',
          AI_MODEL: aiConfig?.model ?? '',
          AI_BASE_URL: aiConfig?.baseUrl ?? '',
          AI_API_KEY: aiConfig?.apiKey ?? '',
          AI_USE_FOR_PARSING: String(aiConfig?.usedFor?.parsing ?? false),
          AI_USE_FOR_NAMING: String(aiConfig?.usedFor?.naming ?? false),
          AI_USE_FOR_FAILURE_ANALYSIS: String(aiConfig?.usedFor?.failureAnalysis ?? false),
          AI_USAGE_OUTPUT_FILE: aiUsagePath,
        },
      });

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, CHILD_JOB_TIMEOUT_MS);

      const appendLog = (line: string): void => {
        const entry = `[${new Date().toISOString()}] [${childId}] ${line}`;
        job.addLog(entry);
        fs.appendFileSync(logsFile, entry + '\n');
        jobStore.set(job);
      };

      child.stdout.on('data', (data: Buffer) => {
        data.toString().split('\n').filter(Boolean).forEach(appendLog);
      });

      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        text
          .split('\n')
          .filter(Boolean)
          .forEach((l) => appendLog(`[STDERR] ${l}`));

        if (isMissingDepsError(text)) {
          appendLog(
            '[ERROR] Error category: PLAYWRIGHT_RUNTIME_MISSING_DEPS - ' +
            'Chromium browser dependencies are missing in this environment. ' +
            'Suggested fix: run "npx playwright install --with-deps chromium" once during environment setup.',
          );
        }
      });

      child.on('close', (code) => {
        clearTimeout(timeoutHandle);
        if (timedOut) {
          resolve({
            childId,
            exitCode: 124,
            durationMs: Date.now() - started,
            attempts: attempt,
            aiUsage: this.readAiUsage(aiUsagePath),
          });
          return;
        }

        resolve({
          childId,
          exitCode: code ?? 1,
          durationMs: Date.now() - started,
          attempts: attempt,
          aiUsage: this.readAiUsage(aiUsagePath),
        });
      });

      child.on('error', (err) => {
        clearTimeout(timeoutHandle);
        reject(err);
      });
    });
  }

  private readAiUsage(aiUsagePath: string): AiUsageSummary | undefined {
    if (!fs.existsSync(aiUsagePath)) {
      return undefined;
    }

    try {
      return JSON.parse(fs.readFileSync(aiUsagePath, 'utf8')) as AiUsageSummary;
    } catch {
      return undefined;
    }
  }
}
