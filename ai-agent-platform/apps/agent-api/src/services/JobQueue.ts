import type { JobEntity } from '../domain/Job';
import type { AiConfig } from '@ai-agent/shared-types';
import fs from 'fs';
import path from 'path';
import { batchJobManager } from './batch/BatchJobManager';
import { jobStore } from './jobStoreInstance';
import { EPHEMERAL_SESSIONS, JOBS_BASE_DIR, MAX_CONCURRENT_JOBS } from '../config';

interface QueuedJob {
  job: JobEntity;
  aiConfig?: AiConfig;
}

type BullConnection = { url: string; maxRetriesPerRequest: null };

/**
 * Job queue with optional BullMQ when REDIS_URL is set; in-process fallback otherwise.
 */
export class JobQueue {
  private readonly queue: QueuedJob[] = [];
  private running = 0;
  private readonly inMemoryAiConfigs = new Map<string, AiConfig>();
  private bullQueue: { add: (name: string, data: { jobId: string }) => Promise<unknown> } | null = null;
  private bullWorkerStarted = false;

  constructor() {
    void this.initBullMq();
  }

  private async initBullMq(): Promise<void> {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) return;
    try {
      const { Queue, Worker } = await import('bullmq');
      const connection: BullConnection = { url: redisUrl, maxRetriesPerRequest: null };
      this.bullQueue = new Queue('agent-jobs', { connection }) as unknown as typeof this.bullQueue;

      if (!this.bullWorkerStarted) {
        this.bullWorkerStarted = true;
        new Worker(
          'agent-jobs',
          async (bullJob) => {
            const { jobId } = bullJob.data as { jobId: string };
            const job = jobStore.get(jobId);
            if (!job) {
              throw new Error(`Job ${jobId} not found in store`);
            }
            const aiConfig = this.resolveAiConfig(jobId);
            await batchJobManager.run(job, aiConfig);
          },
          { connection, concurrency: MAX_CONCURRENT_JOBS },
        );
      }
    } catch (err) {
      console.warn('[JobQueue] BullMQ unavailable, using in-process queue:', err);
      this.bullQueue = null;
    }
  }

  private resolveAiConfig(jobId: string): AiConfig | undefined {
    const inMemory = this.inMemoryAiConfigs.get(jobId);
    if (inMemory) return inMemory;

    const configPath = path.join(JOBS_BASE_DIR, jobId, 'ai-config.json');
    if (!fs.existsSync(configPath)) return undefined;
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf8')) as AiConfig;
    } catch {
      return undefined;
    }
  }

  enqueue(job: JobEntity, aiConfig?: AiConfig): void {
    if (aiConfig) {
      this.inMemoryAiConfigs.set(job.jobId, aiConfig);
    }

    if (this.bullQueue) {
      void this.bullQueue.add('run-batch', { jobId: job.jobId });
      return;
    }
    this.queue.push({ job, aiConfig });
    void this.processNext();
  }

  private async processNext(): Promise<void> {
    if (this.running >= MAX_CONCURRENT_JOBS || this.queue.length === 0) return;
    this.running += 1;
    const next = this.queue.shift();
    if (!next) {
      this.running -= 1;
      return;
    }

    try {
      await batchJobManager.run(next.job, next.aiConfig);
    } catch (err) {
      console.error('[JobQueue] Unhandled error:', err);
    } finally {
      this.inMemoryAiConfigs.delete(next.job.jobId);
      this.running -= 1;
      void this.processNext();
    }
  }
}

export const jobQueue = new JobQueue();
