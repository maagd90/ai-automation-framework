const defaultPlaywrightBrowsersPath = process.env.CODESPACES
  ? '/home/codespace/.cache/ms-playwright'
  : '/ms-playwright';

export const runtimeConfig = {
  MAX_GLOBAL_AGENTS: Number(process.env.MAX_GLOBAL_AGENTS || 5),
  MAX_PARALLEL_AGENTS_PER_JOB: Number(process.env.MAX_PARALLEL_AGENTS_PER_JOB || 3),
  INSTALL_GENERATED_PROJECT_DEPS: process.env.INSTALL_GENERATED_PROJECT_DEPS === 'true',
  PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || defaultPlaywrightBrowsersPath,
};
