import { chromium } from 'playwright';
import { runtimeConfig } from '../config/runtime.config';

let _playwrightReady = false;

export function playwrightReady(): boolean {
  return _playwrightReady;
}

export async function checkPlaywrightReadiness(): Promise<void> {
  try {
    process.env.PLAYWRIGHT_BROWSERS_PATH = runtimeConfig.PLAYWRIGHT_BROWSERS_PATH;
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    _playwrightReady = true;
    console.log('[OK] Playwright readiness check passed. Chromium is available.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    _playwrightReady = false;
    console.warn(
      '[WARN] Playwright readiness check failed. Run: npx playwright install --with-deps chromium',
    );
    console.warn(`[WARN] Playwright error detail: ${msg}`);
  }
}
