import { chromium } from 'playwright';
import { runtimeConfig } from '../config/runtime.config';

export let playwrightReady = false;

export async function checkPlaywrightReadiness(): Promise<void> {
  try {
    process.env.PLAYWRIGHT_BROWSERS_PATH = runtimeConfig.PLAYWRIGHT_BROWSERS_PATH;
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    playwrightReady = true;
    console.log('[OK] Playwright readiness check passed. Chromium is available.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    playwrightReady = false;
    console.warn(
      '[WARN] Playwright readiness check failed. Run: npx playwright install --with-deps chromium',
    );
    console.warn(`[WARN] Playwright error detail: ${msg}`);
  }
}
