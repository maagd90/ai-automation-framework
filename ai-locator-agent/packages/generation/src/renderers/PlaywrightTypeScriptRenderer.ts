import { PageSnapshot, GeneratedArtifact } from '@ai-locator/core';
import { camelCase, pascalCase } from '@ai-locator/shared';

export class PlaywrightTypeScriptRenderer {
  render(snapshot: PageSnapshot, name: string): GeneratedArtifact {
    const pageName = pascalCase(name);
    const camelName = camelCase(name);

    const files = [
      {
        path: 'src/core/browserManager.ts',
        content: this.renderBrowserManager(),
      },
      {
        path: 'src/pages/basePage.ts',
        content: this.renderBasePage(),
      },
      {
        path: `src/pages/${camelName}Page.ts`,
        content: this.renderPageClass(snapshot, pageName, camelName),
      },
      {
        path: `src/tests/${camelName}.spec.ts`,
        content: this.renderTestSpec(pageName, camelName),
      },
    ];

    return { files };
  }

  private renderBrowserManager(): string {
    return `import { Browser, BrowserContext, Page, chromium } from '@playwright/test';

export class BrowserManager {
  private browser?: Browser;
  private context?: BrowserContext;

  async launch(headless = true): Promise<void> {
    this.browser = await chromium.launch({ headless });
    this.context = await this.browser.newContext();
  }

  async newPage(): Promise<Page> {
    if (!this.context) throw new Error('Browser not launched');
    return this.context.newPage();
  }

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
  }
}
`;
  }

  private renderBasePage(): string {
    return `import { Page, Locator } from '@playwright/test';

export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  async navigate(url: string): Promise<void> {
    await this.page.goto(url);
    await this.page.waitForLoadState('networkidle');
  }

  protected locator(selector: string): Locator {
    return this.page.locator(selector);
  }
}
`;
  }

  private renderPageClass(snapshot: PageSnapshot, pageName: string, _camelName: string): string {
    const locatorLines = snapshot.elements
      .map((el) => {
        const propName = camelCase(el.name || el.elementId);
        const loc = el.primaryLocator;
        let locatorExpr = '';
        if (loc.strategy === 'role') {
          const [role, nameMatch] = loc.value.replace('role=', '').split('[name="');
          const roleName = nameMatch ? nameMatch.replace('"]', '') : '';
          locatorExpr = `this.page.getByRole('${role}'${roleName ? `, { name: '${roleName}' }` : ''})`;
        } else if (loc.strategy === 'label') {
          locatorExpr = `this.page.getByLabel('${loc.value}')`;
        } else if (loc.strategy === 'text') {
          locatorExpr = `this.page.getByText('${loc.value}')`;
        } else {
          locatorExpr = `this.page.locator('${loc.value}')`;
        }
        return `  readonly ${propName} = ${locatorExpr};`;
      })
      .join('\n');

    return `import { Page } from '@playwright/test';
import { BasePage } from './basePage';

export class ${pageName}Page extends BasePage {
  constructor(page: Page) {
    super(page);
  }

${locatorLines}
}
`;
  }

  private renderTestSpec(pageName: string, camelName: string): string {
    return `import { test, expect } from '@playwright/test';
import { ${pageName}Page } from '../pages/${camelName}Page';

test.describe('${pageName} tests', () => {
  test('should load page', async ({ page }) => {
    const pageObject = new ${pageName}Page(page);
    await pageObject.navigate('/');
    // Add assertions here
  });
});
`;
  }
}
