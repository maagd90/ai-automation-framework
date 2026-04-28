import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { runtimeConfig } from '../config/runtime.config';
import { logger } from '../utils/logger';

let _playwrightReady = false;

export function playwrightReady(): boolean {
  return _playwrightReady;
}

/**
 * Collect diagnostic information about available browser paths.
 * Used in error logs when Playwright launch fails.
 */
function collectBrowserDiagnostics(): Record<string, unknown> {
  const browsersPath = runtimeConfig.PLAYWRIGHT_BROWSERS_PATH;
  const msPwExists = (() => {
    try { return fs.existsSync('/ms-playwright'); } catch { return false; }
  })();

  let installedFolders: string[] = [];
  try {
    installedFolders = fs.readdirSync(browsersPath);
  } catch {
    try {
      installedFolders = fs.readdirSync('/ms-playwright');
    } catch { /* not accessible */ }
  }

  return {
    PLAYWRIGHT_BROWSERS_PATH: browsersPath,
    msPwExists,
    installedBrowserFolders: installedFolders,
  };
}

/**
 * Build a context-appropriate fix suggestion when Playwright launch fails.
 * In Docker (PLAYWRIGHT_BROWSERS_PATH=/ms-playwright or IN_DOCKER env set),
 * we direct users to rebuild the image — not to install browsers on the host.
 */
function buildFixSuggestion(): string {
  const isDocker = process.env.PLAYWRIGHT_BROWSERS_PATH === '/ms-playwright'
    || process.env.IN_DOCKER === 'true'
    || fs.existsSync('/.dockerenv');

  if (isDocker) {
    return (
      'When running with Docker, rebuild the API image using the official Playwright image. ' +
      'Example: docker compose up --build -d'
    );
  }

  return (
    'Run: npx playwright install --with-deps chromium\n' +
    '  Or set PLAYWRIGHT_BROWSERS_PATH to a directory that contains Chromium.'
  );
}

/**
 * Performs a startup readiness check by attempting to launch Chromium.
 *
 * Sets process.env.PLAYWRIGHT_BROWSERS_PATH so Playwright finds the browsers
 * before the module resolves its internal path (must be set before first launch).
 *
 * Uses `--no-sandbox` and `--disable-dev-shm-usage` which are required inside
 * Docker containers and are also harmless on bare-metal hosts.
 *
 * On failure: logs diagnostic info but does NOT block the server from starting.
 * Generate-only jobs do not require a browser and should not be affected.
 */
export async function checkPlaywrightReadiness(): Promise<void> {
  // Set path before Playwright resolves it internally
  process.env.PLAYWRIGHT_BROWSERS_PATH = runtimeConfig.PLAYWRIGHT_BROWSERS_PATH;

  try {
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    await browser.close();
    _playwrightReady = true;
    logger.info('Playwright readiness check passed', {
      PLAYWRIGHT_BROWSERS_PATH: runtimeConfig.PLAYWRIGHT_BROWSERS_PATH,
    });
    console.log('[OK] Playwright readiness check passed. Chromium is available.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    _playwrightReady = false;
    const diag = collectBrowserDiagnostics();
    const fix = buildFixSuggestion();

    logger.warn('Playwright readiness check failed', {
      error: msg,
      fix,
      ...diag,
    });

    console.warn('[WARN] Playwright readiness check failed.');
    console.warn(`[WARN] Error: ${msg}`);
    console.warn(`[WARN] PLAYWRIGHT_BROWSERS_PATH = ${diag.PLAYWRIGHT_BROWSERS_PATH}`);
    console.warn(`[WARN] /ms-playwright exists    = ${String(diag.msPwExists)}`);
    console.warn(`[WARN] Installed browser folders = ${JSON.stringify(diag.installedBrowserFolders)}`);
    console.warn(`[WARN] Fix: ${fix}`);
    console.warn('[WARN] Note: generate-only jobs do not require Chromium and will still work.');
  }
}
