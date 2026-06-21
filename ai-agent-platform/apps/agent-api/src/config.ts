import path from 'path';

export const AGENT_CORE_PATH = path.resolve(
  __dirname,
  '../../../../dist/cli/index.js',
);

export const JOBS_BASE_DIR = process.env.JOBS_DIR ?? '/tmp/jobs';

export const ALLOWED_FILE_TYPES = ['.txt', '.json', '.feature'];

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const EPHEMERAL_SESSIONS =
  process.env.EPHEMERAL_SESSIONS === 'true' || process.env.PERSIST_UPLOADS === 'false';

export const FORCE_HEADLESS = process.env.FORCE_HEADLESS === 'true';

export const SESSION_RETENTION_MS = Number(process.env.SESSION_RETENTION_MS ?? 15 * 60 * 1000);

export const MAX_PARALLEL_AGENTS = Number(process.env.MAX_PARALLEL_AGENTS ?? 20);

export const MAX_CONCURRENT_JOBS = Number(process.env.MAX_CONCURRENT_JOBS ?? 1);

export const MAX_JOBS_PER_IP_PER_HOUR = Number(process.env.MAX_JOBS_PER_IP_PER_HOUR ?? 3);

export const MVP_MODE =
  process.env.MVP_MODE === 'true' || EPHEMERAL_SESSIONS;

export const API_RATE_LIMIT_MAX = Number(
  process.env.API_RATE_LIMIT_MAX ?? (MVP_MODE ? 20 : 100),
);

export const ABANDONED_JOB_TTL_MS = Number(process.env.ABANDONED_JOB_TTL_MS ?? 60 * 60 * 1000);
