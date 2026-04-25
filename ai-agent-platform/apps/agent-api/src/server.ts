import express from 'express';
import cors from 'cors';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import { jobsRouter } from './routes/jobs.router';
import { configRouter } from './routes/config.router';
import { runtimeConfig } from './config/runtime.config';
import { featureFlags } from './config/feature.config';
import { checkPlaywrightReadiness } from './services/PlaywrightReadinessCheck';
import { pruneOldJobs } from './services/JobRetentionService';

/** Read the container memory limit from the cgroup v2 or v1 file, if available.
 *
 * Returns the limit in megabytes when running inside a memory-constrained
 * container, or `null` when:
 * - running on a bare-metal host with no cgroup memory limit, or
 * - the cgroup files are not accessible (e.g. inside a VM without cgroup mount).
 *
 * cgroup v1 exposes a very large sentinel value (~9.2 × 10^18) when no limit is
 * set; we explicitly ignore that value to avoid reporting a misleading number.
 */
function detectContainerMemoryMB(): number | null {
  // cgroup v2
  try {
    const raw = fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
    if (raw !== 'max') return Math.round(Number(raw) / (1024 * 1024));
  } catch { /* not a cgroup v2 container */ }

  // cgroup v1
  try {
    const raw = fs.readFileSync('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf8').trim();
    const bytes = Number(raw);
    // Ignore the sentinel value used when no limit is set (very large number)
    if (bytes > 0 && bytes < Number.MAX_SAFE_INTEGER / 2) {
      return Math.round(bytes / (1024 * 1024));
    }
  } catch { /* not a cgroup v1 container */ }

  return null;
}

const app = express();
const PORT = process.env.PORT ?? 3001;
const trustProxy = process.env.TRUST_PROXY ?? '1';
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

app.listen(PORT, () => {
  console.log(`Agent API running on http://localhost:${PORT}`);

  // ── Runtime configuration summary ─────────────────────────────────────────
  const memLimitMB = detectContainerMemoryMB();
  const memLine = memLimitMB !== null
    ? `${memLimitMB} MB (container limit)`
    : 'unrestricted (no cgroup limit detected)';

  console.log('[Runtime Config]');
  console.log(`  MAX_GLOBAL_AGENTS              = ${runtimeConfig.MAX_GLOBAL_AGENTS}`);
  console.log(`  MAX_PARALLEL_AGENTS_PER_JOB    = ${runtimeConfig.MAX_PARALLEL_AGENTS_PER_JOB}`);
  console.log(`  MAX_TEST_CASES_PER_JOB         = ${runtimeConfig.MAX_TEST_CASES_PER_JOB}`);
  console.log(`  MAX_DAILY_JOBS_PER_IP          = ${runtimeConfig.MAX_DAILY_JOBS_PER_IP}`);
  console.log(`  JOB_RETENTION_HOURS            = ${runtimeConfig.JOB_RETENTION_HOURS}`);
  console.log(`  INSTALL_GENERATED_PROJECT_DEPS = ${runtimeConfig.INSTALL_GENERATED_PROJECT_DEPS}`);
  console.log(`  PLAYWRIGHT_BROWSERS_PATH       = ${runtimeConfig.PLAYWRIGHT_BROWSERS_PATH}`);
  console.log(`  Detected memory                = ${memLine}`);

  const estimatedMB = 256 + runtimeConfig.MAX_GLOBAL_AGENTS * 500;
  console.log(`  Estimated peak memory usage ≈ ${estimatedMB} MB`);
  console.log(`    (baseAPI ~256 MB + MAX_GLOBAL_AGENTS × ~500 MB/agent)`);

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
