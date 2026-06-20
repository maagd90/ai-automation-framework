import type { JobEntity } from '../domain/Job';
import type { AiConfig } from '@ai-agent/shared-types';
import { batchJobManager } from './batch/BatchJobManager';

interface QueuedJob {
  job: JobEntity;
  aiConfig?: AiConfig;
}

/**
 * Simple in-process job queue. When REDIS_URL is set, jobs could be offloaded to BullMQ in future.
 */
export class JobQueue {
  private readonly queue: QueuedJob[] = [];
  private running = false;

  enqueue(job: JobEntity, aiConfig?: AiConfig): void {
    this.queue.push({ job, aiConfig });
    void this.processNext();
  }

  private async processNext(): Promise<void> {
    if (this.running || this.queue.length === 0) return;
    this.running = true;
    const next = this.queue.shift();
    if (!next) {
      this.running = false;
      return;
    }

    try {
      await batchJobManager.run(next.job, next.aiConfig);
    } catch (err) {
      console.error('[JobQueue] Unhandled error:', err);
    } finally {
      this.running = false;
      void this.processNext();
    }
  }
}

export const jobQueue = new JobQueue();
