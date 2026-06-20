import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { jobStore } from '../services/PersistentJobStore';
import { jobQueue } from '../services/JobQueue';
import { zipService } from '../services/ZipService';
import { JobEntity } from '../domain/Job';
import { JOBS_BASE_DIR, ALLOWED_FILE_TYPES } from '../config';
import { CreateJobSchema } from '../validation/schemas';
import { validateUploadedTestCase } from '../services/UploadValidationService';
import { deriveUrlFromBatch } from '@ai-agent/agent-core';

const TEMP_DIR = fs.realpathSync(os.tmpdir());
const JOBS_BASE_DIR_RESOLVED = path.resolve(JOBS_BASE_DIR);

/**
 * Maps validated file extensions to safe type labels used in server-generated filenames.
 * Using an explicit lookup table (not derived from user input) breaks taint flow for CodeQL.
 */
const EXT_TO_LABEL: Readonly<Record<string, string>> = {
  '.json': 'json',
  '.txt': 'txt',
  '.feature': 'feature',
};

export class JobsController {
  createJob(req: Request, res: Response): void {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    // ── Validate upload path is within OS temp dir (multer-generated, not user-chosen) ─
    const uploadedPath = path.resolve(file.path);
    const isInTemp = uploadedPath.startsWith(TEMP_DIR + path.sep) || uploadedPath === TEMP_DIR;
    if (!isInTemp) {
      res.status(400).json({ error: 'Invalid upload path' });
      return;
    }

    // ── Whitelist extension check ────────────────────────────────────────────
    const ext = path.extname(file.originalname).toLowerCase();
    const typeLabel = EXT_TO_LABEL[ext]; // server-controlled lookup; undefined if not allowed
    if (typeLabel === undefined) {
      // Safe to unlink: uploadedPath already confirmed to be inside TEMP_DIR
      if (isInTemp) try { fs.unlinkSync(uploadedPath); } catch { /* ignore */ }
      res.status(400).json({ error: `File type not allowed. Allowed: ${ALLOWED_FILE_TYPES.join(', ')}` });
      return;
    }

    // Parse and validate all fields via Zod
    const parsed = CreateJobSchema.safeParse(req.body);
    if (!parsed.success) {
      if (isInTemp) try { fs.unlinkSync(uploadedPath); } catch { /* ignore */ }
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
    // inputDir is derived entirely from server-controlled values (JOBS_BASE_DIR + uuid)
    const inputDir = path.resolve(JOBS_BASE_DIR_RESOLVED, jobId, 'input');
    fs.mkdirSync(inputDir, { recursive: true });

    // inputFilePath uses only server-controlled components:
    //   inputDir (server)  +  'testcases'  +  typeLabel (from EXT_TO_LABEL, not from user)
    const inputFilePath = path.resolve(inputDir, `testcases.${typeLabel}`);
    // Move from temp → job input dir
    fs.renameSync(uploadedPath, inputFilePath);

    const uploadValidation = validateUploadedTestCase(inputFilePath);
    if (!uploadValidation.valid) {
      try { fs.unlinkSync(inputFilePath); } catch { /* ignore */ }
      res.status(400).json({
        error: 'Test case validation failed',
        errors: uploadValidation.errors,
      });
      return;
    }

    let resolvedUrl = url;
    if (!resolvedUrl && uploadValidation.batch) {
      resolvedUrl = deriveUrlFromBatch(uploadValidation.batch);
    }

    if (!resolvedUrl) {
      res.status(400).json({
        error: 'URL is required when test cases do not include a navigate step with a valid URL.',
      });
      return;
    }

    const job = new JobEntity({
      jobId,
      inputFile: inputFilePath,
      url: resolvedUrl,
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

    // Run asynchronously via job queue
    jobQueue.enqueue(job, aiConfig);

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

  listJobs(req: Request, res: Response): void {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const jobs = jobStore.list(status);
    res.json({
      jobs: jobs.map((job) => ({
        jobId: job.jobId,
        status: job.status,
        createdAt: job.createdAt,
        totalCases: job.totalCases,
        processedCases: job.processedCases,
      })),
    });
  }

  cancelJob(req: Request, res: Response): void {
    const { jobId } = req.params as { jobId: string };
    try {
      const job = jobStore.getOrThrow(jobId);
      if (job.status === 'completed' || job.status === 'failed') {
        jobStore.delete(jobId);
        res.json({ message: 'Job removed' });
        return;
      }
      job.setStatus('failed');
      job.error = 'Cancelled by user';
      jobStore.set(job);
      res.json({ message: 'Job cancelled' });
    } catch {
      res.status(404).json({ error: 'Job not found' });
    }
  }

  streamLogs(req: Request, res: Response): void {
    const { jobId } = req.params as { jobId: string };
    try {
      const job = jobStore.getOrThrow(jobId);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      let cursor = 0;
      const send = (): void => {
        while (cursor < job.logs.length) {
          res.write(`data: ${JSON.stringify({ line: job.logs[cursor] })}\n\n`);
          cursor += 1;
        }
        if (job.status === 'completed' || job.status === 'failed') {
          res.write(`data: ${JSON.stringify({ done: true, status: job.status })}\n\n`);
          res.end();
          return;
        }
        setTimeout(send, 1000);
      };
      send();
    } catch {
      res.status(404).json({ error: 'Job not found' });
    }
  }

  getArtifact(req: Request, res: Response): void {
    const { jobId, testCaseId, kind } = req.params as {
      jobId: string;
      testCaseId: string;
      kind: string;
    };
    try {
      const job = jobStore.getOrThrow(jobId);
      if (!job.artifactsPath) {
        res.status(404).json({ error: 'Artifacts not available' });
        return;
      }

      const testResultsDir = path.join(job.artifactsPath, 'test-results');
      if (!fs.existsSync(testResultsDir)) {
        res.status(404).json({ error: 'Test results not found' });
        return;
      }

      const files = this.findFilesRecursive(testResultsDir);
      const match = files.find((file) => {
        if (kind === 'screenshot') return file.endsWith('.png');
        if (kind === 'trace') return file.endsWith('.zip');
        return false;
      });

      if (!match) {
        res.status(404).json({ error: 'Artifact not found', testCaseId });
        return;
      }

      res.sendFile(path.resolve(match));
    } catch {
      res.status(404).json({ error: 'Job not found' });
    }
  }

  private findFilesRecursive(dir: string): string[] {
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.findFilesRecursive(fullPath));
      } else {
        results.push(fullPath);
      }
    }
    return results;
  }
}

export const jobsController = new JobsController();
