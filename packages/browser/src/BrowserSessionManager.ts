import { chromium, Browser, Page, LaunchOptions } from 'playwright';
import { Logger } from '@locator-agent/shared';

export class BrowserSessionManager {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private readonly logger = new Logger('BrowserSessionManager');

  async launch(options?: LaunchOptions): Promise<void> {
    this.logger.info('Launching browser');
    this.browser = await chromium.launch({ headless: true, ...options });
    const context = await this.browser.newContext();
    this.page = await context.newPage();
  }

  getPage(): Page {
    if (!this.page) throw new Error('Browser not launched');
    return this.page;
  }

  async close(): Promise<void> {
    this.logger.info('Closing browser');
    await this.browser?.close();
    this.browser = null;
    this.page = null;
  }
}
