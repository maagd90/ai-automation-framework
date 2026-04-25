import type { Page } from 'playwright';
import { Logger } from '../../utils/Logger.js';

export class PageNavigator {
  private readonly logger = new Logger('PageNavigator');

  constructor(private readonly page: Page) {}

  async navigate(url: string): Promise<void> {
    this.logger.info(`Navigating to ${url}`);
    await this.page.goto(url, { waitUntil: 'networkidle' });
  }

  async waitForReady(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
  }

  async getTitle(): Promise<string> {
    return this.page.title();
  }
}
