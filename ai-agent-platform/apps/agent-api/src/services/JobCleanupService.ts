import fs from 'fs';
import path from 'path';
import { JOBS_BASE_DIR, SESSION_RETENTION_MS, ABANDONED_JOB_TTL_MS } from '../config';
import { jobStore } from './jobStoreInstance';

const scheduledCleanups = new Map<string, NodeJS.Timeout>();

export class JobCleanupService {
  scheduleCleanup(jobId: string, delayMs = SESSION_RETENTION_MS): void {
    this.cancelScheduledCleanup(jobId);
    const timer = setTimeout(() => {
      scheduledCleanups.delete(jobId);
      this.cleanup(jobId);
    }, delayMs);
    scheduledCleanups.delete(jobId);
    scheduledCleanups.set(jobId, timer);
  }

  cancelScheduledCleanup(jobId: string): void {
    const existing = scheduledCleanups.get(jobId);
    if (existing) {
      clearTimeout(existing);
      scheduledCleanups.delete(jobId);
    }
  }

  cleanup(jobId: string): void {
    this.cancelScheduledCleanup(jobId);
    const jobDir = path.join(JOBS_BASE_DIR, jobId);
    if (fs.existsSync(jobDir)) {
      try {
        fs.rmSync(jobDir, { recursive: true, force: true });
      } catch {
        // best-effort wipe
      }
    }
    jobStore.delete(jobId);
  }

  startAbandonedJobSweeper(): void {
    setInterval(() => {
      const cutoff = Date.now() - ABANDONED_JOB_TTL_MS;
      for (const job of jobStore.list()) {
        if (job.status !== 'pending' && job.status !== 'running') continue;
        const updated = Date.parse(job.updatedAt);
        if (!Number.isNaN(updated) && updated < cutoff) {
          job.setStatus('failed');
          job.error = 'Job abandoned — exceeded TTL';
          jobStore.set(job);
          this.scheduleCleanup(job.jobId, 0);
        }
      }
    }, 5 * 60 * 1000);
  }
}

export const jobCleanupService = new JobCleanupService();
