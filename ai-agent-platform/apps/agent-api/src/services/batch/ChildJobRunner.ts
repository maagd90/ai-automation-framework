import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import type { AiConfig, AiUsageSummary } from '@ai-agent/shared-types';
import { AGENT_CORE_PATH, JOBS_BASE_DIR } from '../../config';
import { runtimeConfig } from '../../config/runtime.config';
import { JobEntity } from '../../domain/Job';
import { jobStore } from '../JobStore';
import { logger } from '../../utils/logger';

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

/**
 * Runs a single child agent process for one test case split.
 *
 * Spawns a Node.js child process executing the agent core CLI `generate` command.
 * Streams stdout and stderr back to the parent job log.
 * Detects Playwright missing-dependency errors in stderr and appends a diagnostic message.
 * Enforces a 20-minute timeout (CHILD_JOB_TIMEOUT_MS) per child run.
 * Reads the AI usage JSON file written by the child process after completion.
 */
export class ChildJobRunner {
  /**
   * Spawns a child agent process to generate a Playwright project for one test case.
   *
   * The child process runs `node <AGENT_CORE_PATH> generate --file ... --url ... --output ...`.
   * AI configuration is forwarded as environment variables so the agent core can apply them.
   * A kill timer enforces the maximum run duration; timed-out processes resolve with exit code 124.
   *
   * @param job - The parent job entity (provides URL, headless setting, and log destination).
   * @param childId - Unique identifier for this child run (used for log prefixing and directory naming).
   * @param childFilePath - Absolute path to the split test case JSON file for this child.
   * @param aiConfig - Optional AI configuration forwarded to the child process as env vars.
   * @param attempt - Current attempt number (1-based), used for log context during retries.
   * @returns Result containing exit code, duration, attempt count, and optional AI usage data.
   */
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

      // Log command and safe environment flags (never include AI_API_KEY or secrets)
      logger.info('Child agent starting', {
        jobId: job.jobId,
        childId,
        attempt,
        script: 'agent-core/generate',
        env: {
          PLAYWRIGHT_BROWSERS_PATH: runtimeConfig.PLAYWRIGHT_BROWSERS_PATH,
          HEADLESS: String(job.headless),
          AI_ENABLED: String((aiConfig?.provider ?? 'none') !== 'none'),
          AI_PROVIDER: aiConfig?.provider ?? 'none',
          AI_MODEL: aiConfig?.model ?? '',
          AI_USE_FOR_PARSING: String(aiConfig?.usedFor?.parsing ?? false),
          AI_USE_FOR_NAMING: String(aiConfig?.usedFor?.naming ?? false),
          AI_USE_FOR_FAILURE_ANALYSIS: String(aiConfig?.usedFor?.failureAnalysis ?? false),
        },
        startedAt: new Date().toISOString(),
      });

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
        const durationMs = Date.now() - started;
        if (timedOut) {
          logger.warn('Child agent timed out', {
            jobId: job.jobId,
            childId,
            attempt,
            timeoutMs: CHILD_JOB_TIMEOUT_MS,
            durationMs,
          });
          resolve({
            childId,
            exitCode: 124,
            durationMs,
            attempts: attempt,
            aiUsage: this.readAiUsage(aiUsagePath),
          });
          return;
        }

        const exitCode = code ?? 1;
        if (exitCode === 0) {
          logger.info('Child agent completed', { jobId: job.jobId, childId, attempt, exitCode, durationMs });
        } else {
          logger.warn('Child agent exited with non-zero code', { jobId: job.jobId, childId, attempt, exitCode, durationMs });
        }

        resolve({
          childId,
          exitCode,
          durationMs,
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

  /**
   * Reads the AI usage JSON file written by the child agent process after generation.
   *
   * The file is written to `<childDir>/ai-usage.json` by the agent core's GenerateCommand
   * when AI features are enabled. Returns undefined if the file does not exist or cannot be parsed.
   *
   * @param aiUsagePath - Absolute path to the AI usage output file.
   * @returns Parsed AI usage summary, or undefined if unavailable.
   */
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
