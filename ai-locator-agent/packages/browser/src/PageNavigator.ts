import { Browser, Page } from 'playwright';
import { FrameContext } from '@ai-locator/core';
import { NavigationError, createLogger } from '@ai-locator/shared';

export class PageNavigator {
  private readonly logger = createLogger('PageNavigator');
  private page?: Page;

  constructor(private readonly browser: Browser) {}

  async navigate(url: string): Promise<Page> {
    this.logger.info('Navigating', { url });
    const context = await this.browser.newContext();
    this.page = await context.newPage();
    try {
      await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    } catch (err) {
      throw new NavigationError(url, err);
    }
    return this.page;
  }

  async waitForReady(): Promise<void> {
    if (!this.page) throw new Error('No page open');
    await this.page.waitForLoadState('networkidle');
  }

  async getFrameContexts(): Promise<FrameContext[]> {
    if (!this.page) return [];
    const frames = this.page.frames();
    return frames.map((frame, idx) => ({
      frameId: String(idx),
      url: frame.url(),
      parentFrameId: idx > 0 ? '0' : undefined,
    }));
  }

  getPage(): Page {
    if (!this.page) throw new Error('No page open');
    return this.page;
  }
}
