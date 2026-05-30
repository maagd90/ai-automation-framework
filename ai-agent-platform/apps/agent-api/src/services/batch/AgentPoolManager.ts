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

/**
 * Manages a pool of child agent processes for a batch job.
 *
 * Enforces two levels of concurrency control:
 * 1. A per-job concurrency cap (requestedConcurrency / MAX_PARALLEL_AGENTS_PER_JOB).
 * 2. A global concurrency cap (MAX_GLOBAL_AGENTS) shared across all running jobs on the server.
 *
 * Child agents are retried up to job.retryCount + 1 times on failure before being marked as failed.
 * Global slots are acquired before each child run and released in a finally block to prevent leaks.
 */
export class AgentPoolManager {
  private readonly runner = new ChildJobRunner();

  /**
   * Runs all split test case files through child agent processes with controlled parallelism.
   *
   * Spawns up to `requestedConcurrency` concurrent workers (capped by MAX_PARALLEL_AGENTS_PER_JOB
   * and MAX_GLOBAL_AGENTS). Each worker pulls from the shared queue until all splits are processed.
   * Failed splits are retried according to job.retryCount before being included as failures.
   *
   * @param job - The job entity used for logging and retry configuration.
   * @param splits - Array of split file descriptors, each containing a childId and file path.
   * @param requestedConcurrency - Desired number of parallel child agents for this job.
   * @param aiConfig - Optional AI configuration passed through to each child agent process.
   * @returns Array of child run results, one per split, in completion order.
   */
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
            result = await this.runner.run(job, split.childId, split.filePath, split.featureName, aiConfig, attempt);
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
