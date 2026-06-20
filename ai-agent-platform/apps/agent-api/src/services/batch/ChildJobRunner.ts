import { spawn } from 'child_process';
import path from 'path';
import { AGENT_CORE_PATH, JOBS_BASE_DIR } from '../../config';
import fs from 'fs';
import type { AiConfig, AiUsageSummary } from '@ai-agent/shared-types';
import { deriveUrlFromSteps } from '@ai-agent/agent-core';
import { JobEntity } from '../../domain/Job';
import { jobStore } from '../PersistentJobStore';

export interface ChildRunResult {
  childId: string;
  testCaseId: string;
  testCaseName: string;
  priority?: string;
  inputSteps?: Array<{ order: number; action: string; target?: string; value?: string; expected?: string }>;
  exitCode: number;
  durationMs: number;
  attempts: number;
  error?: string;
  aiUsage?: AiUsageSummary;
}

export class ChildJobRunner {
  async run(
    job: JobEntity,
    childId: string,
    childFilePath: string,
    testCaseMeta: { id: string; name: string; priority?: string; steps?: ChildRunResult['inputSteps'] },
    aiConfig?: AiConfig,
    attempt = 1,
  ): Promise<ChildRunResult> {
    const childDir = path.join(JOBS_BASE_DIR, job.jobId, 'children', childId);
    const outputDir = path.join(childDir, 'generated');
    const aiUsagePath = path.join(childDir, 'ai-usage.json');
    const logsFile = path.join(JOBS_BASE_DIR, job.jobId, 'logs.txt');
    fs.mkdirSync(outputDir, { recursive: true });

    const childUrl = this.resolveChildUrl(childFilePath, job.url);
    const started = Date.now();

    const args = [
      AGENT_CORE_PATH,
      'generate',
      '--file', childFilePath,
      '--url', childUrl,
      '--output', outputDir,
      '--headless', String(job.headless),
    ];

    return new Promise<ChildRunResult>((resolve, reject) => {
      const child = spawn('node', args, {
        shell: false,
        env: {
          ...process.env,
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
        data
          .toString()
          .split('\n')
          .filter(Boolean)
          .forEach((l) => appendLog(`[STDERR] ${l}`));
      });

      child.on('close', (code) => {
        resolve({
          childId,
          testCaseId: testCaseMeta.id,
          testCaseName: testCaseMeta.name,
          priority: testCaseMeta.priority,
          inputSteps: testCaseMeta.steps,
          exitCode: code ?? 1,
          durationMs: Date.now() - started,
          attempts: attempt,
          aiUsage: this.readAiUsage(aiUsagePath),
        });
      });

      child.on('error', reject);
    });
  }

  private resolveChildUrl(childFilePath: string, fallbackUrl: string): string {
    try {
      const raw = JSON.parse(fs.readFileSync(childFilePath, 'utf8')) as {
        steps?: Array<{ order: number; action: string; target?: string }>;
      };
      if (raw.steps) {
        const fromSteps = deriveUrlFromSteps(raw.steps);
        if (fromSteps) return fromSteps;
      }
    } catch {
      // use fallback
    }
    return fallbackUrl;
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
