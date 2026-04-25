import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { Logger } from '../../utils/Logger.js';

export interface SessionOptions {
  headless?: boolean;
  timeout?: number;
}

export class BrowserSessionManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private readonly logger = new Logger('BrowserSessionManager');

  async launch(options: SessionOptions = {}): Promise<void> {
    this.logger.info('Launching browser', { headless: options.headless ?? true });
    this.browser = await chromium.launch({ headless: options.headless ?? true });
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();
    if (options.timeout) {
      this.page.setDefaultTimeout(options.timeout);
    }
  }

  getPage(): Page {
    if (!this.page) throw new Error('Browser session not started. Call launch() first.');
    return this.page;
  }

  async close(): Promise<void> {
    this.logger.info('Closing browser session');
    await this.browser?.close();
    this.browser = null;
    this.context = null;
    this.page = null;
  }
}
