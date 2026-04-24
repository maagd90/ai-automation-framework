import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { jobStore } from '../services/JobStore';
import { agentRunner } from '../services/AgentRunner';
import { zipService } from '../services/ZipService';
import { JobEntity } from '../domain/Job';
import { JOBS_BASE_DIR, ALLOWED_FILE_TYPES } from '../config';

export class JobsController {
  createJob(req: Request, res: Response): void {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_FILE_TYPES.includes(ext)) {
      fs.unlinkSync(file.path);
      res.status(400).json({ error: `File type not allowed. Allowed: ${ALLOWED_FILE_TYPES.join(', ')}` });
      return;
    }

    const { url, framework, headless } = req.body as {
      url?: string;
      framework?: string;
      headless?: string;
    };

    if (!url || !framework) {
      fs.unlinkSync(file.path);
      res.status(400).json({ error: 'url and framework are required' });
      return;
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      fs.unlinkSync(file.path);
      res.status(400).json({ error: 'Invalid URL provided' });
      return;
    }

    const jobId = uuidv4();
    const inputDir = path.join(JOBS_BASE_DIR, jobId, 'input');
    fs.mkdirSync(inputDir, { recursive: true });

    // Sanitize filename — only keep basename
    const safeFilename = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    const inputFilePath = path.join(inputDir, safeFilename);
    fs.renameSync(file.path, inputFilePath);

    const job = new JobEntity({
      jobId,
      inputFile: inputFilePath,
      url,
      framework,
      headless: headless === 'true',
    });

    jobStore.set(job);

    // Run asynchronously — do not await
    void agentRunner.run(job);

    res.status(201).json({ jobId });
  }

  getStatus(req: Request, res: Response): void {
    const { jobId } = req.params as { jobId: string };
    try {
      const job = jobStore.getOrThrow(jobId);
      res.json({ jobId: job.jobId, status: job.status });
    } catch {
      res.status(404).json({ error: 'Job not found' });
    }
  }

  getLogs(req: Request, res: Response): void {
    const { jobId } = req.params as { jobId: string };
    try {
      const job = jobStore.getOrThrow(jobId);
      res.json({ logs: job.logs });
    } catch {
      res.status(404).json({ error: 'Job not found' });
    }
  }

  getReport(req: Request, res: Response): void {
    const { jobId } = req.params as { jobId: string };
    try {
      const job = jobStore.getOrThrow(jobId);
      if (!job.report) {
        res.status(404).json({ error: 'Report not available yet' });
        return;
      }
      res.json(job.report);
    } catch {
      res.status(404).json({ error: 'Job not found' });
    }
  }

  downloadArtifacts(req: Request, res: Response): void {
    const { jobId } = req.params as { jobId: string };
    try {
      const job = jobStore.getOrThrow(jobId);
      if (job.status !== 'completed' || !job.artifactsPath) {
        res.status(404).json({ error: 'Artifacts not available' });
        return;
      }
      zipService.streamZip(job.artifactsPath, job.jobId, res);
    } catch {
      res.status(404).json({ error: 'Job not found' });
    }
  }
}

export const jobsController = new JobsController();
