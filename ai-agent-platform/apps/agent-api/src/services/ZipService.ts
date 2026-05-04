import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import type { Response } from 'express';
import { JOBS_BASE_DIR } from '../config';

const JOBS_BASE_DIR_RESOLVED = path.resolve(JOBS_BASE_DIR);

/**
 * Top-level names (relative to the archived directory root) that must never
 * appear in the downloaded ZIP.  These are runtime or dependency artefacts
 * that are either too large or meaningless outside the Docker container.
 *
 * Note: allure-results/ and allure-report/ are intentionally NOT excluded so
 * that users receive the Allure output when generate-and-execute is used.
 */
const ZIP_EXCLUDED_TOP_LEVEL = new Set([
  'node_modules',
  'test-results',
  'playwright-report',
]);

const ZIP_EXCLUDED_FILES = new Set(['.last-run.json']);

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
    archive.directory(dirPath, false, (entry) => {
      // entry.name is the path relative to dirPath, using forward slashes on all platforms.
      const topLevel = entry.name.split('/')[0];
      if (ZIP_EXCLUDED_TOP_LEVEL.has(topLevel)) return false;
      if (ZIP_EXCLUDED_FILES.has(entry.name)) return false;
      return entry;
    });
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
