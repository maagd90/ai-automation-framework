import path from 'path';

export const AGENT_CORE_PATH = path.resolve(
  __dirname,
  '../../../../../dist/cli/index.js',
);

export const JOBS_BASE_DIR = process.env.JOBS_DIR ?? '/tmp/jobs';

export const ALLOWED_FILE_TYPES = ['.txt', '.json', '.feature'];

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
