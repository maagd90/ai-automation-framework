import fs from 'fs';
import path from 'path';

export class BasePageGenerator {
  write(pagesDir: string): void {
    fs.mkdirSync(pagesDir, { recursive: true });
    const content = `import { type Page } from '@playwright/test';

export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  async goto(url: string): Promise<void> {
    await this.page.goto(url);
    await this.page.waitForLoadState('networkidle');
  }

  async waitForReady(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
  }
}
`;
    fs.writeFileSync(path.join(pagesDir, 'BasePage.ts'), content, 'utf8');
  }
}
