import type { SplitResult } from '@ai-agent/agent-core';
import type { AiConfig } from '@ai-agent/shared-types';
import { JobEntity } from '../../domain/Job';
import { jobStore } from '../JobStore';
import { runtimeConfig } from '../../config/runtime.config';
import { ChildJobRunner, type ChildRunResult } from './ChildJobRunner';

let GLOBAL_ACTIVE_AGENTS = 0;

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const acquireGlobalSlot = async (onAcquire: (active: number, max: number) => void): Promise<void> => {
  while (GLOBAL_ACTIVE_AGENTS >= runtimeConfig.MAX_GLOBAL_AGENTS) {
    await sleep(100);
  }

  GLOBAL_ACTIVE_AGENTS += 1;
  onAcquire(GLOBAL_ACTIVE_AGENTS, runtimeConfig.MAX_GLOBAL_AGENTS);
};

const releaseGlobalSlot = (onRelease: (active: number, max: number) => void): void => {
  GLOBAL_ACTIVE_AGENTS = Math.max(0, GLOBAL_ACTIVE_AGENTS - 1);
  onRelease(GLOBAL_ACTIVE_AGENTS, runtimeConfig.MAX_GLOBAL_AGENTS);
};

export class AgentPoolManager {
  private readonly runner = new ChildJobRunner();

  async runAll(
    job: JobEntity,
    splits: SplitResult[],
    requestedConcurrency: number,
    aiConfig?: AiConfig,
  ): Promise<ChildRunResult[]> {
    const concurrency = Math.max(1, requestedConcurrency);
    const results: ChildRunResult[] = [];
    const queue = [...splits];

    const runNext = async (): Promise<void> => {
      while (queue.length > 0) {
        const split = queue.shift();
        if (!split) break;

        let result!: ChildRunResult;
        let attempt = 0;
        const maxAttempts = Math.max(1, job.retryCount + 1);

        do {
          attempt += 1;
          if (attempt > 1) {
            job.addLog(
              `[${new Date().toISOString()}] Retrying ${split.childId} (${attempt}/${maxAttempts})`,
            );
            jobStore.set(job);
          }
          await acquireGlobalSlot((active, max) => {
            job.addLog(
              `[${new Date().toISOString()}] ${split.childId} acquired global slot. Global active agents: ${active}. Max allowed: ${max}`,
            );
            jobStore.set(job);
          });
          try {
            result = await this.runner.run(job, split.childId, split.filePath, aiConfig, attempt);
          } finally {
            releaseGlobalSlot((active, max) => {
              job.addLog(
                `[${new Date().toISOString()}] ${split.childId} released global slot. Global active agents: ${active}. Max allowed: ${max}`,
              );
              jobStore.set(job);
            });
          }
        } while (result.exitCode !== 0 && attempt < maxAttempts);

        results.push(result);

        job.incrementProcessed();
        job.addLog(
          `[${new Date().toISOString()}] ${split.childId} finished — exit code ${result.exitCode} after ${result.attempts} attempt(s)`,
        );
        jobStore.set(job);
      }
    };

    const workers = Array.from({ length: concurrency }, () => runNext());
    await Promise.all(workers);

    return results;
  }
}
