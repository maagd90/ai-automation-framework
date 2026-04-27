import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { jobStore } from '../services/JobStore';
import { batchJobManager } from '../services/batch/BatchJobManager';
import { zipService } from '../services/ZipService';
import { ipRateLimiter } from '../services/IpRateLimiter';
import { JobEntity } from '../domain/Job';
import { JOBS_BASE_DIR, ALLOWED_FILE_TYPES } from '../config';
import { runtimeConfig } from '../config/runtime.config';
import { featureFlags } from '../config/feature.config';
import { CreateJobSchema } from '../validation/schemas';
import { logger } from '../utils/logger';

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

/** Maps AI providers to the environment variable used as a key fallback. */
const PROVIDER_ENV_KEY: Readonly<Partial<Record<string, string>>> = {
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  azure: 'AZURE_OPENAI_API_KEY',
};

/**
 * Moves a file from sourcePath to targetPath in a cross-device safe manner.
 *
 * On the same filesystem, fs.renameSync is used (atomic, fast).
 * When source and target are on different filesystems (EXDEV), the file is
 * copied then the source is deleted — which is the standard fallback.
 */
function moveUploadedFileSafely(sourcePath: string, targetPath: string): void {
  try {
    fs.renameSync(sourcePath, targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EXDEV') {
      fs.copyFileSync(sourcePath, targetPath);
      fs.unlinkSync(sourcePath);
      return;
    }
    throw error;
  }
}

export class JobsController {
  async createJob(req: Request, res: Response): Promise<void> {
    const requestId = uuidv4();
    logger.info('POST /api/jobs received', { requestId });

    // Declared outside try so the catch block can clean up the temp file on failure.
    let uploadedPath: string | undefined;

    try {
    // ── Per-IP daily rate limit ──────────────────────────────────────────────
    const clientIp = req.ip ?? 'unknown';
    if (!ipRateLimiter.tryConsume(clientIp)) {
      logger.warn('Rate limit exceeded', { requestId, clientIp });
      res.status(429).json({
        error: `Daily job limit reached (${runtimeConfig.MAX_DAILY_JOBS_PER_IP} jobs/day per IP). Try again tomorrow.`,
      });
      return;
    }

    const file = req.file;
    if (!file) {
      logger.warn('Job creation rejected: no file uploaded', { requestId });
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    logger.info('Incoming job request', {
      requestId,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
    });

    // ── Validate upload path is within OS temp dir (multer-generated, not user-chosen) ─
    uploadedPath = path.resolve(file.path);
    const isInTemp = uploadedPath.startsWith(TEMP_DIR + path.sep) || uploadedPath === TEMP_DIR;
    if (!isInTemp) {
      logger.error('Upload path outside temp dir', { requestId, uploadedPath });
      res.status(400).json({ error: 'Invalid upload path' });
      return;
    }

    logger.debug('File upload received', {
      requestId,
      filePath: uploadedPath,
      fileExtension: path.extname(file.originalname).toLowerCase(),
      fileSize: file.size,
    });

    // ── Whitelist extension check ────────────────────────────────────────────
    const ext = path.extname(file.originalname).toLowerCase();
    const typeLabel = EXT_TO_LABEL[ext]; // server-controlled lookup; undefined if not allowed
    if (typeLabel === undefined) {
      // Safe to unlink: uploadedPath already confirmed to be inside TEMP_DIR
      if (isInTemp) try { fs.unlinkSync(uploadedPath); } catch { /* ignore */ }
      logger.warn('File type not allowed', { requestId, fileExtension: ext });
      res.status(400).json({ error: `File type not allowed. Allowed: ${ALLOWED_FILE_TYPES.join(', ')}` });
      return;
    }

    // Parse and validate all fields via Zod
    const parsed = CreateJobSchema.safeParse(req.body);
    if (!parsed.success) {
      if (isInTemp) try { fs.unlinkSync(uploadedPath); } catch { /* ignore */ }
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      logger.warn('Job request validation failed', { requestId, issues });
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
      provider: rawProvider,
      apiKey,
      model,
      baseUrl,
      usedForParsing,
      usedForNaming,
      usedForFailureAnalysis,
    } = parsed.data;

    let { traceOnFailure, videoOnFailure } = parsed.data;

    // ── Feature flag enforcement ─────────────────────────────────────────────
    // If AI providers are disabled server-side, ignore any requested provider.
    const provider = featureFlags.ENABLE_AI_PROVIDERS ? rawProvider : 'none';

    // If trace/video capture is disabled, silently override to false.
    if (!featureFlags.ENABLE_TRACE_VIDEO) {
      traceOnFailure = false;
      videoOnFailure = false;
    }

    // ── AI API key resolution and validation ─────────────────────────────────
    // Resolve API key: UI-submitted key takes precedence; fall back to the
    // provider-specific environment variable when the UI key is absent.
    // The resolved key is never logged, stored in JobEntity, or returned.
    const envKeyName = PROVIDER_ENV_KEY[provider];
    // Treat blank UI input the same as absent — trim and convert to undefined first.
    const uiApiKey = apiKey?.trim() || undefined;
    const resolvedApiKey = uiApiKey ?? (envKeyName ? process.env[envKeyName] : undefined);

    // Providers that require a key must have one before the job is created.
    if (envKeyName && !resolvedApiKey) {
      if (isInTemp) try { fs.unlinkSync(uploadedPath); } catch { /* ignore */ }
      logger.warn('Missing API key for provider', { requestId, provider });
      res.status(400).json({ error: 'API key is required for selected AI provider.' });
      return;
    }

    logger.info('Job request validated', {
      requestId,
      provider,
      executionMode,
      parallelAgents,
      url,
      fileType: typeLabel,
      fileSize: file.size,
    });

    const jobId = uuidv4();
    // inputDir is derived entirely from server-controlled values (JOBS_BASE_DIR + uuid)
    const inputDir = path.resolve(JOBS_BASE_DIR_RESOLVED, jobId, 'input');
    fs.mkdirSync(inputDir, { recursive: true });

    // inputFilePath uses only server-controlled components:
    //   inputDir (server)  +  'testcases'  +  typeLabel (from EXT_TO_LABEL, not from user)
    const inputFilePath = path.resolve(inputDir, `testcases.${typeLabel}`);
    // Move from temp → job input dir (cross-device safe)
    console.log('[JobsController] Upload received', {
      originalName: file.originalname,
      size: file.size,
      uploadedPath,
      targetPath: inputFilePath,
    });
    logger.info('Moving uploaded file to job input dir', { requestId, uploadedPath, targetPath: inputFilePath });
    moveUploadedFileSafely(uploadedPath, inputFilePath);
    console.log('[JobsController] Uploaded file moved successfully', {
      jobId,
      targetPath: inputFilePath,
    });
    logger.info('Uploaded file moved successfully', { requestId, jobId, targetPath: inputFilePath });

    // ── Early JSON test-case count validation ────────────────────────────────
    // Enforces MAX_TEST_CASES_PER_JOB before creating the job entity so the
    // caller receives an HTTP 400 (not a 500 from the async runner).
    if (ext === '.json') {
      try {
        const fileContent = fs.readFileSync(inputFilePath, 'utf8');
        const fileJson = JSON.parse(fileContent) as Record<string, unknown>;
        const count = Array.isArray(fileJson['testCases'])
          ? (fileJson['testCases'] as unknown[]).length
          : 1;
        if (count > runtimeConfig.MAX_TEST_CASES_PER_JOB) {
          // Clean up the just-created job input directory
          try { fs.rmSync(inputDir, { recursive: true, force: true }); } catch { /* ignore */ }
          logger.warn('Test case count exceeds limit', {
            requestId,
            count,
            limit: runtimeConfig.MAX_TEST_CASES_PER_JOB,
          });
          res.status(400).json({
            error:
              `This file contains ${count} test cases. Demo limit is ` +
              `${runtimeConfig.MAX_TEST_CASES_PER_JOB}. Increase MAX_TEST_CASES_PER_JOB ` +
              `or upload a smaller file.`,
          });
          return;
        }
      } catch (parseErr) {
        // Non-fatal: if we can't pre-validate let the batch runner report the error.
        logger.warn('Could not pre-validate JSON test case count', {
          requestId,
          error: parseErr instanceof Error ? parseErr.message : String(parseErr),
        });
      }
    }

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

    logger.info('Job created', { jobId, requestId });

    // Build AiConfig — resolvedApiKey is never logged or returned; it is not stored in JobEntity
    const aiConfig =
      provider !== 'none'
        ? {
            provider,
            apiKey: resolvedApiKey,
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
      logger.error('Unhandled runner error', { jobId, error: msg });
      console.error(`[Job ${jobId}] Unhandled runner error: ${msg}`);
    });

    res.status(201).json({ jobId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[JobsController] Job creation failed', {
        message: msg,
        stack: err instanceof Error ? err.stack : undefined,
      });
      logger.error('Job creation failed unexpectedly', { requestId, error: msg });

      // Clean up the multer temp file if it was not yet moved successfully.
      if (uploadedPath && fs.existsSync(uploadedPath)) {
        try { fs.unlinkSync(uploadedPath); } catch { /* ignore */ }
      }

      if (!res.headersSent) {
        res.status(500).json({ error: msg });
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

      if (job.artifactsDownloaded) {
        res.status(410).json({ error: 'Artifacts already downloaded or expired' });
        return;
      }

      if (job.status !== 'completed' || !job.artifactsPath) {
        res.status(404).json({ error: 'Artifacts not available' });
        return;
      }

      zipService.streamZip(job.artifactsPath, job.jobId, res, () => {
        job.markDownloaded();
        jobStore.set(job);
      });
    } catch {
      res.status(404).json({ error: 'Job not found' });
    }
  }
}

export const jobsController = new JobsController();
