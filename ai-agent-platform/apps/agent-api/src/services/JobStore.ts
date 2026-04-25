import { JobEntity } from '../domain/Job';

export class JobStore {
  private readonly jobs = new Map<string, JobEntity>();

  set(job: JobEntity): void {
    this.jobs.set(job.jobId, job);
  }

  get(jobId: string): JobEntity | undefined {
    return this.jobs.get(jobId);
  }

  getOrThrow(jobId: string): JobEntity {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);
    return job;
  }
}

export const jobStore = new JobStore();
