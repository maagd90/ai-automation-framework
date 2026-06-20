import fs from 'fs';
import path from 'path';
import type { Job } from '@ai-agent/shared-types';
import { JobEntity } from '../domain/Job';
import { JOBS_BASE_DIR } from '../config';

const STORE_DIR = path.join(JOBS_BASE_DIR, '_store');

interface StoredJob extends Job {
  inputFile: string;
}

export class PersistentJobStore {
  private readonly cache = new Map<string, JobEntity>();

  constructor() {
    fs.mkdirSync(STORE_DIR, { recursive: true });
    this.loadAll();
  }

  set(job: JobEntity): void {
    this.cache.set(job.jobId, job);
    this.persist(job);
  }

  get(jobId: string): JobEntity | undefined {
    return this.cache.get(jobId);
  }

  getOrThrow(jobId: string): JobEntity {
    const job = this.cache.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);
    return job;
  }

  list(status?: string): JobEntity[] {
    const jobs = Array.from(this.cache.values());
    if (!status) return jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return jobs.filter((job) => job.status === status);
  }

  delete(jobId: string): void {
    this.cache.delete(jobId);
    const filePath = path.join(STORE_DIR, `${jobId}.json`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  private loadAll(): void {
    for (const file of fs.readdirSync(STORE_DIR)) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(STORE_DIR, file), 'utf8')) as StoredJob;
        const job = new JobEntity({
          jobId: raw.jobId,
          inputFile: raw.inputFile,
          url: raw.url,
          framework: raw.framework,
          executionMode: raw.executionMode,
          headless: raw.headless,
          parallelAgents: raw.parallelAgents,
          autoScale: raw.autoScale,
          retryCount: raw.retryCount,
          screenshotOnFailure: raw.screenshotOnFailure,
          traceOnFailure: raw.traceOnFailure,
          videoOnFailure: raw.videoOnFailure,
        });
        Object.assign(job, raw);
        this.cache.set(job.jobId, job);
      } catch {
        // skip corrupt records
      }
    }
  }

  private persist(job: JobEntity): void {
    fs.writeFileSync(path.join(STORE_DIR, `${job.jobId}.json`), JSON.stringify(job, null, 2));
  }
}

export const jobStore = new PersistentJobStore();
