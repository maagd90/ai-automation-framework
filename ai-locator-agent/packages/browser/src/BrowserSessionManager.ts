import { Browser, BrowserType, LaunchOptions, chromium } from 'playwright';
import { createLogger } from '@ai-locator/shared';

export class BrowserSessionManager {
  private readonly logger = createLogger('BrowserSessionManager');
  private browser?: Browser;
  private readonly browserType: BrowserType;

  constructor(browserType?: BrowserType) {
    this.browserType = browserType ?? chromium;
  }

  async launch(options?: LaunchOptions): Promise<Browser> {
    this.logger.info('Launching browser', { headless: options?.headless ?? true });
    this.browser = await this.browserType.launch({ headless: true, ...options });
    return this.browser;
  }

  async close(): Promise<void> {
    if (this.browser) {
      this.logger.info('Closing browser');
      await this.browser.close();
      this.browser = undefined;
    }
  }

  getBrowser(): Browser {
    if (!this.browser) {
      throw new Error('Browser not launched');
    }
    return this.browser;
  }
}
