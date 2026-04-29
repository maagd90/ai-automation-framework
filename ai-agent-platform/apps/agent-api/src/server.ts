import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { jobsRouter } from './routes/jobs.router';
import { configRouter } from './routes/config.router';
import { runtimeConfig } from './config/runtime.config';
import { featureFlags } from './config/feature.config';
import { checkPlaywrightReadiness } from './services/PlaywrightReadinessCheck';
import { runtimeResourceService } from './services/RuntimeResourceService';
import { pruneOldJobs } from './services/JobRetentionService';
import { logger } from './utils/logger';

const app = express();
const PORT = process.env.PORT ?? 3001;
const trustProxy = process.env.TRUST_PROXY ?? '1';
const demoMode = process.env.DEMO_MODE === 'true';
const allowedOrigins = (process.env.ALLOWED_ORIGINS
  ?? 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.set('trust proxy', trustProxy === 'true' || trustProxy === '1' ? 1 : false);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      if (demoMode) {
        try {
          const { hostname } = new URL(origin);
          if (hostname.endsWith('.trycloudflare.com')) {
            console.log('[CORS] Allowed demo tunnel origin:', origin);
            callback(null, true);
            return;
          }
        } catch { /* malformed origin — fall through to reject */ }
      }
      callback(new Error('CORS origin not allowed'));
    },
  }),
);
app.use(express.json());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);
app.use('/api/jobs', jobsRouter);
app.use('/api/config', configRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Multer error handler ───────────────────────────────────────────────────
// Must have 4 parameters to be treated as an error-handling middleware by Express.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error & { code?: string }, _req: Request, res: Response, next: NextFunction) => {
  if (err.name === 'MulterError' || err.code?.startsWith('LIMIT_')) {
    logger.warn('Multer upload error', { error: err.message, code: err.code });
    res.status(400).json({ error: err.message });
    return;
  }
  next(err);
});

// ── Global error handler ───────────────────────────────────────────────────
// Catches anything passed to next(err) or thrown inside async route handlers.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  const msg = err.message ?? 'Internal server error';
  logger.error('Unhandled request error', { error: msg, stack: err?.stack });
  if (!res.headersSent) {
    res.status(500).json({ error: msg });
  }
});

app.listen(PORT, () => {
  console.log(`Agent API running on http://localhost:${PORT}`);

  // ── Runtime configuration summary ─────────────────────────────────────────
  runtimeResourceService.logEnvironmentSummary();

  const estimatedMB = 256 + runtimeConfig.MAX_GLOBAL_AGENTS * runtimeConfig.AGENT_MEMORY_MB;
  console.log('[Runtime Config]');
  console.log(`  MAX_GLOBAL_AGENTS              = ${runtimeConfig.MAX_GLOBAL_AGENTS}`);
  console.log(`  MAX_PARALLEL_AGENTS_PER_JOB    = ${runtimeConfig.MAX_PARALLEL_AGENTS_PER_JOB}`);
  console.log(`  MAX_TEST_CASES_PER_JOB         = ${runtimeConfig.MAX_TEST_CASES_PER_JOB}`);
  console.log(`  MAX_TEST_CASES_HARD_LIMIT      = ${runtimeConfig.MAX_TEST_CASES_HARD_LIMIT}`);
  console.log(`  MAX_DAILY_JOBS_PER_IP          = ${runtimeConfig.MAX_DAILY_JOBS_PER_IP}`);
  console.log(`  JOB_RETENTION_HOURS            = ${runtimeConfig.JOB_RETENTION_HOURS}`);
  console.log(`  INSTALL_GENERATED_PROJECT_DEPS = ${runtimeConfig.INSTALL_GENERATED_PROJECT_DEPS}`);
  console.log(`  PLAYWRIGHT_BROWSERS_PATH       = ${runtimeConfig.PLAYWRIGHT_BROWSERS_PATH}`);
  console.log(`  AUTO_OPTIMIZE_AGENTS           = ${runtimeConfig.AUTO_OPTIMIZE_AGENTS}`);
  console.log(`  Available memory               = ${runtimeResourceService.availableMemoryMB()} MB`);
  console.log(`  Estimated peak memory usage ≈ ${estimatedMB} MB`);
  console.log(`    (baseAPI ~256 MB + MAX_GLOBAL_AGENTS × ~${runtimeConfig.AGENT_MEMORY_MB} MB/agent)`);

  // Log Playwright package version to detect Docker image/package mismatches at a glance
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pwPkg = require('playwright/package.json') as { version: string };
    console.log(`  Playwright package version     = ${pwPkg.version}`);
    console.log(`  Docker expected image          = mcr.microsoft.com/playwright:v${pwPkg.version}-jammy`);
  } catch {
    console.log('  Playwright package version     = (could not resolve)');
  }

  console.log('[Feature Flags]');
  console.log(`  ENABLE_AI_PROVIDERS      = ${featureFlags.ENABLE_AI_PROVIDERS}`);
  console.log(`  ENABLE_LOCAL_LLM         = ${featureFlags.ENABLE_LOCAL_LLM}`);
  console.log(`  ENABLE_TRACE_VIDEO       = ${featureFlags.ENABLE_TRACE_VIDEO}`);
  console.log(`  ENABLE_BATCH_LARGE_UPLOAD = ${featureFlags.ENABLE_BATCH_LARGE_UPLOAD}`);
  console.log(`  ENABLE_ADMIN_PANEL       = ${featureFlags.ENABLE_ADMIN_PANEL}`);
  // ──────────────────────────────────────────────────────────────────────────

  // Prune expired job artifacts on startup, then every JOB_RETENTION_HOURS
  pruneOldJobs();
  const retentionIntervalMs = runtimeConfig.JOB_RETENTION_HOURS * 60 * 60 * 1000;
  setInterval(pruneOldJobs, retentionIntervalMs).unref();

  checkPlaywrightReadiness().catch(() => {/* already logged inside */});
});

export { app };
