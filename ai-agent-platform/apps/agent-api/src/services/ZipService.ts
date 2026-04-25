import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import type { Response } from 'express';

export class ZipService {
  streamZip(dirPath: string, jobId: string, res: Response): void {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="job-${jobId}-artifacts.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('error', (err) => {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to create zip archive' });
      }
      console.error('Archive error:', err);
    });

    archive.pipe(res);
    archive.directory(dirPath, false);
    void archive.finalize();
  }
}

export const zipService = new ZipService();
