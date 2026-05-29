const defaultPlaywrightBrowsersPath = process.env.CODESPACES
  ? '/home/codespace/.cache/ms-playwright'
  : '/ms-playwright';

const rawRepairAttempts = process.env.WEBWRIGHT_MAX_REPAIR_ATTEMPTS;
const resolvePositiveInt = (raw: string | undefined, fallback: number): number => {
  const value = Number(raw ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const runtimeConfig = {
  // Concurrency — Phase 1 demo-safe defaults
  MAX_GLOBAL_AGENTS: Number(process.env.MAX_GLOBAL_AGENTS || 1),
  MAX_PARALLEL_AGENTS_PER_JOB: Number(process.env.MAX_PARALLEL_AGENTS_PER_JOB || 1),
  MAX_GLOBAL_AGENTS_HARD_LIMIT: Number(process.env.MAX_GLOBAL_AGENTS_HARD_LIMIT || 4),
  MAX_PARALLEL_AGENTS_PER_JOB_HARD_LIMIT: Number(process.env.MAX_PARALLEL_AGENTS_PER_JOB_HARD_LIMIT || 4),

  // Per-job test case cap — prevents runaway resource usage on large uploads
  MAX_TEST_CASES_PER_JOB: Number(process.env.MAX_TEST_CASES_PER_JOB || 5),
  // Absolute ceiling — no request can exceed this regardless of user input
  MAX_TEST_CASES_HARD_LIMIT: Number(process.env.MAX_TEST_CASES_HARD_LIMIT || 20),

  // Per-IP daily job cap (in-memory; resets on process restart)
  MAX_DAILY_JOBS_PER_IP: Number(process.env.MAX_DAILY_JOBS_PER_IP || 20),

  // Age in hours after which completed job artifact directories are pruned
  JOB_RETENTION_HOURS: Number(process.env.JOB_RETENTION_HOURS || 24),

  // Dynamic agent autoscaling
  AUTO_OPTIMIZE_AGENTS: process.env.AUTO_OPTIMIZE_AGENTS !== 'false',
  MIN_AGENTS: Number(process.env.MIN_AGENTS || 1),
  AGENT_MEMORY_MB: Number(process.env.AGENT_MEMORY_MB || 500),
  SYSTEM_RESERVED_MEMORY_MB: Number(process.env.SYSTEM_RESERVED_MEMORY_MB || 1024),
  // Roughly one agent per N test cases in auto mode
  TEST_CASES_PER_AGENT_TARGET: Number(process.env.TEST_CASES_PER_AGENT_TARGET || 5),

  INSTALL_GENERATED_PROJECT_DEPS: process.env.INSTALL_GENERATED_PROJECT_DEPS === 'true',
  PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || defaultPlaywrightBrowsersPath,
  ENABLE_WEBWRIGHT: process.env.ENABLE_WEBWRIGHT === 'true',
  WEBWRIGHT_MODE: process.env.WEBWRIGHT_MODE || 'repair',
  WEBWRIGHT_TIMEOUT_SECONDS: resolvePositiveInt(process.env.WEBWRIGHT_TIMEOUT_SECONDS, 180),
  WEBWRIGHT_MAX_REPAIR_ATTEMPTS: resolvePositiveInt(rawRepairAttempts, 1),
  WEBWRIGHT_MIN_CONFIDENCE: Number(process.env.WEBWRIGHT_MIN_CONFIDENCE || 0.75),
  WEBWRIGHT_DOCKER_ONLY: process.env.WEBWRIGHT_DOCKER_ONLY !== 'false',
  WEBWRIGHT_OUTPUT_DIR: process.env.WEBWRIGHT_OUTPUT_DIR || '/tmp/jobs/webwright',
  WEBWRIGHT_ALLOWED_DOMAINS: process.env.WEBWRIGHT_ALLOWED_DOMAINS || '',
};
