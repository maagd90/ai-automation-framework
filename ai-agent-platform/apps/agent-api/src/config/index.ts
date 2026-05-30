import path from 'path';

/** Absolute path to the repo root (the workspace that has @playwright/test installed). */
export const REPO_ROOT_DIR = path.resolve(__dirname, '../../../../..');

/** Absolute path to the platform monorepo root (ai-agent-platform/). */
export const PLATFORM_BASE_DIR = path.resolve(__dirname, '../../../..');

export const AGENT_CORE_PATH = path.resolve(
  REPO_ROOT_DIR,
  'dist/cli/index.js',
);

export const JOBS_BASE_DIR = process.env.JOBS_DIR ?? '/tmp/jobs';

export const ALLOWED_FILE_TYPES = ['.txt', '.json', '.feature'];

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
