const defaultPlaywrightBrowsersPath = process.env.CODESPACES
  ? '/home/codespace/.cache/ms-playwright'
  : '/ms-playwright';

export const runtimeConfig = {
  // Concurrency — Phase 1 demo-safe defaults
  MAX_GLOBAL_AGENTS: Number(process.env.MAX_GLOBAL_AGENTS || 2),
  MAX_PARALLEL_AGENTS_PER_JOB: Number(process.env.MAX_PARALLEL_AGENTS_PER_JOB || 1),

  // Per-job test case cap — prevents runaway resource usage on large uploads
  MAX_TEST_CASES_PER_JOB: Number(process.env.MAX_TEST_CASES_PER_JOB || 10),

  // Per-IP daily job cap (in-memory; resets on process restart)
  MAX_DAILY_JOBS_PER_IP: Number(process.env.MAX_DAILY_JOBS_PER_IP || 20),

  // Age in hours after which completed job artifact directories are pruned
  JOB_RETENTION_HOURS: Number(process.env.JOB_RETENTION_HOURS || 24),

  INSTALL_GENERATED_PROJECT_DEPS: process.env.INSTALL_GENERATED_PROJECT_DEPS === 'true',
  PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || defaultPlaywrightBrowsersPath,
};
