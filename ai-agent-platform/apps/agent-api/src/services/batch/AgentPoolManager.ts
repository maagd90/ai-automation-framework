import type { SplitResult } from '@ai-agent/agent-core';
import type { AiConfig } from '@ai-agent/shared-types';
import { JobEntity } from '../../domain/Job';
import { jobStore } from '../jobStoreInstance';
import { ChildJobRunner, type ChildRunResult } from './ChildJobRunner';

export class AgentPoolManager {
  private readonly runner = new ChildJobRunner();

  async runAll(
    job: JobEntity,
    splits: SplitResult[],
    aiConfig?: AiConfig,
  ): Promise<ChildRunResult[]> {
    const concurrency = Math.max(1, job.parallelAgents);
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
          result = await this.runner.run(
            job,
            split.childId,
            split.filePath,
            split.content,
            {
              id: split.testCase.id,
              name: split.testCase.name,
              priority: split.testCase.priority,
              steps: split.testCase.steps,
            },
            aiConfig,
            attempt,
          );
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

    return results.sort((a, b) => a.childId.localeCompare(b.childId));
  }
}
