import type { SplitResult } from '@ai-agent/agent-core';
import { JobEntity } from '../../domain/Job';
import { jobStore } from '../JobStore';
import { ChildJobRunner, type ChildRunResult } from './ChildJobRunner';

export class AgentPoolManager {
  private readonly runner = new ChildJobRunner();

  async runAll(job: JobEntity, splits: SplitResult[]): Promise<ChildRunResult[]> {
    const concurrency = Math.max(1, job.parallelAgents);
    const results: ChildRunResult[] = [];
    const queue = [...splits];

    const runNext = async (): Promise<void> => {
      while (queue.length > 0) {
        const split = queue.shift();
        if (!split) break;

        const result = await this.runner.run(job, split.childId, split.filePath);
        results.push(result);

        job.incrementProcessed();
        job.addLog(
          `[${new Date().toISOString()}] ${split.childId} finished — exit code ${result.exitCode}`,
        );
        jobStore.set(job);
      }
    };

    const workers = Array.from({ length: concurrency }, () => runNext());
    await Promise.all(workers);

    return results;
  }
}
