import { PageSnapshot, GeneratedFile, GeneratedArtifact } from '@locator-agent/core';
import { toPascalCase, toCamelCase } from '@locator-agent/shared';

export class PlaywrightTypeScriptRenderer {
  render(snapshot: PageSnapshot, pageName: string): GeneratedArtifact {
    const pageClass = toPascalCase(pageName);
    const files: GeneratedFile[] = [
      this.renderBrowserManager(),
      this.renderBasePage(),
      this.renderPageObject(snapshot, pageName, pageClass),
      this.renderTestSpec(pageClass, pageName, snapshot.url),
    ];
    return { framework: 'playwright-typescript', language: 'typescript', files };
  }

  private renderBrowserManager(): GeneratedFile {
    return {
      path: 'src/core/browserManager.ts',
      content: `import { chromium, Browser, Page } from 'playwright';

export class BrowserManager {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async launch(headless = true): Promise<void> {
    this.browser = await chromium.launch({ headless });
    const context = await this.browser.newContext();
    this.page = await context.newPage();
  }

  getPage(): Page {
    if (!this.page) throw new Error('Browser not launched');
    return this.page;
  }

  async close(): Promise<void> {
    await this.browser?.close();
  }
}
`,
    };
  }

  private renderBasePage(): GeneratedFile {
    return {
      path: 'src/pages/basePage.ts',
      content: `import { Page } from 'playwright';

export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  async waitForReady(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }
}
`,
    };
  }

  private renderPageObject(snapshot: PageSnapshot, pageName: string, pageClass: string): GeneratedFile {
    const locatorFields = snapshot.elements
      .map(el => `  readonly ${toCamelCase(el.name || el.elementId)} = this.page.locator('${el.primaryLocator.value}');`)
      .join('\n');

    return {
      path: `src/pages/${pageName}Page.ts`,
      content: `import { Page } from 'playwright';
import { BasePage } from './basePage';

export class ${pageClass}Page extends BasePage {
  // Locators
${locatorFields}

  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await this.page.goto('${snapshot.url}');
    await this.page.waitForLoadState('networkidle');
  }
}
`,
    };
  }

  private renderTestSpec(pageClass: string, pageName: string, url: string): GeneratedFile {
    return {
      path: `src/tests/${pageName}.spec.ts`,
      content: `import { test, expect } from '@playwright/test';
import { ${pageClass}Page } from '../pages/${pageName}Page';

test.describe('${pageClass} Page', () => {
  test('should load the page', async ({ page }) => {
    const pageObject = new ${pageClass}Page(page);
    await pageObject.goto();
    await expect(page).toHaveURL('${url}');
  });
});
`,
    };
  }
}
