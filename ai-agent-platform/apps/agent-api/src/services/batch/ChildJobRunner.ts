import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import type { AiConfig } from '@ai-agent/shared-types';
import { AGENT_CORE_PATH, JOBS_BASE_DIR } from '../../config';
import { JobEntity } from '../../domain/Job';
import { jobStore } from '../JobStore';

export interface ChildRunResult {
  childId: string;
  exitCode: number;
  durationMs: number;
  attempts: number;
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
          exitCode: code ?? 1,
          durationMs: Date.now() - started,
          attempts: attempt,
        });
      });

      child.on('error', reject);
    });
  }
}
