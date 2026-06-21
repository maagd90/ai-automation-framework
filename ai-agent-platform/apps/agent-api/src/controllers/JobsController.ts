import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { jobStore } from '../services/jobStoreInstance';
import { jobQueue } from '../services/JobQueue';
import { zipService } from '../services/ZipService';
import { jobCleanupService } from '../services/JobCleanupService';
import { JobEntity } from '../domain/Job';
import {
  JOBS_BASE_DIR,
  ALLOWED_FILE_TYPES,
  EPHEMERAL_SESSIONS,
  FORCE_HEADLESS,
  MAX_PARALLEL_AGENTS,
} from '../config';
import { CreateJobSchema } from '../validation/schemas';
import {
  validateUploadedTestCase,
  validateUploadedTestCaseContent,
} from '../services/UploadValidationService';
import { validateBatchNavigateUrls, validateJobUrl } from '../services/SsrfUrlGuard';
import { deriveUrlFromBatch } from '@ai-agent/agent-core';

const TEMP_DIR = fs.realpathSync(os.tmpdir());
const JOBS_BASE_DIR_RESOLVED = path.resolve(JOBS_BASE_DIR);

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

    const ext = path.extname(file.originalname).toLowerCase();
    const typeLabel = EXT_TO_LABEL[ext];
    if (typeLabel === undefined) {
      this.cleanupUploadTemp(file);
      res.status(400).json({ error: `File type not allowed. Allowed: ${ALLOWED_FILE_TYPES.join(', ')}` });
      return;
    }

    const parsed = CreateJobSchema.safeParse(req.body);
    if (!parsed.success) {
      this.cleanupUploadTemp(file);
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      res.status(400).json({ error: `Validation error: ${issues}` });
      return;
    }

    let {
      url,
      framework,
      executionMode,
      headless,
      parallelAgents,
      autoScale,
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

    if (FORCE_HEADLESS) {
      headless = true;
    }
    parallelAgents = Math.min(parallelAgents, MAX_PARALLEL_AGENTS);

    const jobId = uuidv4();
    let uploadValidation;
    let inputFile: string | undefined;
    let batch = undefined as ReturnType<typeof validateUploadedTestCase>['batch'];
    let uploadFilename: string | undefined;

    if (EPHEMERAL_SESSIONS) {
      uploadValidation = validateUploadedTestCaseContent(
        file.buffer.toString('utf8'),
        file.originalname,
      );
      uploadFilename = file.originalname;
      batch = uploadValidation.batch;
    } else {
      const uploadedPath = path.resolve(file.path);
      const isInTemp = uploadedPath.startsWith(TEMP_DIR + path.sep) || uploadedPath === TEMP_DIR;
      if (!isInTemp) {
        res.status(400).json({ error: 'Invalid upload path' });
        return;
      }

      const inputDir = path.resolve(JOBS_BASE_DIR_RESOLVED, jobId, 'input');
      fs.mkdirSync(inputDir, { recursive: true });
      inputFile = path.resolve(inputDir, `testcases.${typeLabel}`);
      fs.renameSync(uploadedPath, inputFile);
      uploadValidation = validateUploadedTestCase(inputFile);
    }

    if (!uploadValidation.valid) {
      if (inputFile) {
        try { fs.unlinkSync(inputFile); } catch { /* ignore */ }
      }
      res.status(400).json({
        error: 'Test case validation failed',
        errors: uploadValidation.errors,
      });
      return;
    }

    this.finishCreateJob(res, {
      jobId,
      inputFile,
      batch: batch ?? uploadValidation.batch,
      uploadFilename,
      uploadValidation,
      url,
      framework,
      executionMode,
      headless,
      parallelAgents,
      autoScale,
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
    });
  }

  private finishCreateJob(
    res: Response,
    params: {
      jobId: string;
      inputFile?: string;
      batch?: NonNullable<ReturnType<typeof validateUploadedTestCase>['batch']>;
      uploadFilename?: string;
      uploadValidation: ReturnType<typeof validateUploadedTestCase>;
      url?: string;
      framework: string;
      executionMode: 'generate-only' | 'generate-and-execute';
      headless: boolean;
      parallelAgents: number;
      autoScale: boolean;
      retryCount: number;
      screenshotOnFailure: boolean;
      traceOnFailure: boolean;
      videoOnFailure: boolean;
      provider: string;
      apiKey?: string;
      model?: string;
      baseUrl?: string;
      usedForParsing: boolean;
      usedForNaming: boolean;
      usedForFailureAnalysis: boolean;
    },
  ): void {
    const {
      jobId,
      inputFile,
      batch,
      uploadFilename,
      uploadValidation,
      framework,
      executionMode,
      headless,
      parallelAgents,
      autoScale,
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
    } = params;
    let { url } = params;

    if (uploadValidation.batch) {
      const ssrfBatch = validateBatchNavigateUrls(uploadValidation.batch);
      if (!ssrfBatch.valid) {
        res.status(400).json({ error: ssrfBatch.message });
        return;
      }
    }

    if (!url && uploadValidation.batch) {
      url = deriveUrlFromBatch(uploadValidation.batch);
    }

    if (!url) {
      res.status(400).json({
        error: 'URL is required when test cases do not include a navigate step with a valid URL.',
      });
      return;
    }

    const ssrfUrl = validateJobUrl(url);
    if (!ssrfUrl.valid) {
      res.status(400).json({ error: ssrfUrl.message });
      return;
    }

    const job = new JobEntity({
      jobId,
      inputFile,
      batch,
      uploadFilename,
      url,
      framework,
      executionMode,
      headless,
      parallelAgents,
      autoScale,
      retryCount,
      screenshotOnFailure,
      traceOnFailure,
      videoOnFailure,
    });

    jobStore.set(job);

    const aiConfig =
      provider !== 'none'
        ? {
            provider: provider as 'openai' | 'gemini' | 'azure' | 'local' | 'none',
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

    if (aiConfig && !EPHEMERAL_SESSIONS) {
      const aiConfigPath = path.join(JOBS_BASE_DIR_RESOLVED, jobId, 'ai-config.json');
      fs.mkdirSync(path.dirname(aiConfigPath), { recursive: true });
      fs.writeFileSync(aiConfigPath, JSON.stringify(aiConfig));
    }

    jobQueue.enqueue(job, aiConfig);
    res.status(201).json({ jobId });
  }

  private cleanupUploadTemp(file: NonNullable<Request['file']>): void {
    if (file.path) {
      const uploadedPath = path.resolve(file.path);
      const isInTemp = uploadedPath.startsWith(TEMP_DIR + path.sep) || uploadedPath === TEMP_DIR;
      if (isInTemp) {
        try { fs.unlinkSync(uploadedPath); } catch { /* ignore */ }
      }
    }
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
        parallelAgents: job.parallelAgents,
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

  getCaseDetail(req: Request, res: Response): void {
    const { jobId, testCaseId } = req.params as { jobId: string; testCaseId: string };
    try {
      const job = jobStore.getOrThrow(jobId);
      if (!job.report?.testCaseResults) {
        res.status(404).json({ error: 'Case results not available yet' });
        return;
      }
      const testCase = job.report.testCaseResults.find((tc) => tc.id === testCaseId);
      if (!testCase) {
        res.status(404).json({ error: 'Test case not found in report' });
        return;
      }
      res.json({
        jobId,
        batchName: job.report.batchName,
        testCase,
      });
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
        jobCleanupService.scheduleCleanup(jobId, 0);
        res.json({ message: 'Job removed' });
        return;
      }
      job.setStatus('failed');
      job.error = 'Cancelled by user';
      jobStore.set(job);
      jobCleanupService.scheduleCleanup(jobId, 0);
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
