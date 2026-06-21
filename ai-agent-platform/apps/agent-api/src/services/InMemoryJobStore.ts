import { JobEntity } from '../domain/Job';

export class InMemoryJobStore {
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

  list(status?: string): JobEntity[] {
    const jobs = Array.from(this.jobs.values());
    if (!status) return jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return jobs.filter((job) => job.status === status);
  }

  delete(jobId: string): void {
    this.jobs.delete(jobId);
  }
}
