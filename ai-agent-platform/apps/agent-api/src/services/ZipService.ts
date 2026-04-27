import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import type { Response } from 'express';
import { JOBS_BASE_DIR } from '../config';

const JOBS_BASE_DIR_RESOLVED = path.resolve(JOBS_BASE_DIR);

export class ZipService {
  streamZip(dirPath: string, jobId: string, res: Response, onSuccess?: () => void): void {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="job-${jobId}-artifacts.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('error', (err) => {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to create zip archive' });
      }
      console.error('Archive error:', err);
    });

    // After the response stream closes (download complete), clean up and notify caller
    res.on('finish', () => {
      this.deleteJobDir(dirPath, jobId);
      if (onSuccess) onSuccess();
    });

    archive.pipe(res);
    archive.directory(dirPath, false);
    void archive.finalize();
  }

  private deleteJobDir(dirPath: string, jobId: string): void {
    // Safety: only delete paths that resolve to inside JOBS_BASE_DIR
    const resolved = path.resolve(dirPath);
    if (!resolved.startsWith(JOBS_BASE_DIR_RESOLVED + path.sep) && resolved !== JOBS_BASE_DIR_RESOLVED) {
      console.error(`[ZipService] Refusing to delete path outside JOBS_DIR: ${resolved}`);
      return;
    }

    // Walk up to the job-level directory (the UUID folder) to delete everything
    const jobDir = path.join(JOBS_BASE_DIR_RESOLVED, jobId);
    const jobDirResolved = path.resolve(jobDir);
    if (!jobDirResolved.startsWith(JOBS_BASE_DIR_RESOLVED + path.sep)) {
      console.error(`[ZipService] Refusing to delete unsafe job path: ${jobDirResolved}`);
      return;
    }

    fs.rm(jobDirResolved, { recursive: true, force: true }, (err) => {
      if (err) {
        console.error(`[ZipService] Failed to cleanup job ${jobId}:`, err.message);
      } else {
        console.log(`[ZipService] Cleaned up job artifacts: ${jobId}`);
      }
    });
  }
}

export const zipService = new ZipService();
