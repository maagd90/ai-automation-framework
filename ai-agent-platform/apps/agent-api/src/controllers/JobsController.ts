import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { jobStore } from '../services/JobStore';
import { batchJobManager } from '../services/batch/BatchJobManager';
import { zipService } from '../services/ZipService';
import { JobEntity } from '../domain/Job';
import { JOBS_BASE_DIR, ALLOWED_FILE_TYPES } from '../config';
import { CreateJobSchema } from '../validation/schemas';

const TEMP_DIR = fs.realpathSync(os.tmpdir());

function safeUnlink(filePath: string): void {
  const resolved = path.resolve(filePath);
  if (resolved.startsWith(TEMP_DIR + path.sep) || resolved.startsWith(TEMP_DIR)) {
    try { fs.unlinkSync(resolved); } catch { /* ignore */ }
  }
}

export class JobsController {
  createJob(req: Request, res: Response): void {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const uploadedPath = path.resolve(file.path);
    if (!uploadedPath.startsWith(TEMP_DIR + path.sep) && uploadedPath !== TEMP_DIR) {
      res.status(400).json({ error: 'Invalid upload path' });
      return;
    }

    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_FILE_TYPES.includes(ext)) {
      safeUnlink(uploadedPath);
      res.status(400).json({ error: `File type not allowed. Allowed: ${ALLOWED_FILE_TYPES.join(', ')}` });
      return;
    }

    // Parse and validate all fields via Zod
    const parsed = CreateJobSchema.safeParse(req.body);
    if (!parsed.success) {
      safeUnlink(uploadedPath);
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      res.status(400).json({ error: `Validation error: ${issues}` });
      return;
    }

    const {
      url,
      framework,
      executionMode,
      headless,
      parallelAgents,
      retryCount,
      screenshotOnFailure,
      traceOnFailure,
      videoOnFailure,
      provider,
      apiKey,
      model,
      baseUrl,
      usedForParsing,
      usedForNaming,
      usedForFailureAnalysis,
    } = parsed.data;

    const jobId = uuidv4();
    const inputDir = path.join(JOBS_BASE_DIR, jobId, 'input');
    fs.mkdirSync(inputDir, { recursive: true });

    const safeFilename = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    const inputFilePath = path.join(inputDir, safeFilename);
    if (!inputFilePath.startsWith(inputDir + path.sep) && inputFilePath !== inputDir) {
      safeUnlink(uploadedPath);
      res.status(400).json({ error: 'Invalid filename' });
      return;
    }
    fs.renameSync(uploadedPath, inputFilePath);

    const job = new JobEntity({
      jobId,
      inputFile: inputFilePath,
      url,
      framework,
      executionMode,
      headless,
      parallelAgents,
      retryCount,
      screenshotOnFailure,
      traceOnFailure,
      videoOnFailure,
    });

    jobStore.set(job);

    // Build AiConfig — apiKey is never logged or returned
    const aiConfig =
      provider !== 'none'
        ? {
            provider,
            apiKey,
            model,
            baseUrl,
            usedFor: {
              parsing: usedForParsing,
              naming: usedForNaming,
              failureAnalysis: usedForFailureAnalysis,
            },
          }
        : undefined;

    // Run asynchronously — do not await
    void batchJobManager.run(job, aiConfig).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Job ${jobId}] Unhandled runner error: ${msg}`);
    });

    res.status(201).json({ jobId });
  }

  getStatus(req: Request, res: Response): void {
    const { jobId } = req.params as { jobId: string };
    try {
      const job = jobStore.getOrThrow(jobId);
      res.json({
        jobId: job.jobId,
        status: job.status,
        totalCases: job.totalCases,
        processedCases: job.processedCases,
      });
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
