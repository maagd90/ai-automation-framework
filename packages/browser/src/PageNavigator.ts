import { Page } from 'playwright';
import { FrameContext } from '@locator-agent/core';
import { Logger } from '@locator-agent/shared';

export class PageNavigator {
  private readonly logger = new Logger('PageNavigator');

  constructor(private readonly page: Page) {}

  async navigate(url: string): Promise<void> {
    this.logger.info('Navigating', { url });
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  async waitForReady(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  async getFrameContexts(): Promise<FrameContext[]> {
    const frames = this.page.frames();
    return frames.map((frame, idx) => ({
      frameId: String(idx),
      url: frame.url(),
      parentFrameId: frame.parentFrame() ? String(frames.indexOf(frame.parentFrame()!)) : null,
    }));
  }
}
