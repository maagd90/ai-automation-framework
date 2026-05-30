import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { WebwrightPatchService } from '../../ai-agent-platform/apps/agent-api/src/services/webwright/WebwrightPatchService';

function makeProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webwright-patch-'));
  fs.mkdirSync(path.join(dir, 'src', 'pages'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src', 'tests'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'src', 'pages', 'ProductsPage.ts'),
    "import { type Page, expect } from '@playwright/test';\n\nexport class ProductsPage {\n  constructor(private readonly page: Page) {}\n\n  async goto(): Promise<void> {\n    await this.page.goto('/products');\n  }\n}\n",
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, 'src', 'tests', 'products.spec.ts'),
    "import { expect, test } from '@playwright/test';\n\ntest('products', async ({ page }) => {\n  await expect(page.locator('[data-testid=\"cart-badge\"]')).toHaveText('1');\n});\n",
    'utf8',
  );
  return dir;
}

describe('WebwrightPatchService', () => {
  it('passes the expected argument when patching assertion calls', () => {
    const finalDir = makeProject();
    const service = new WebwrightPatchService();

    const result = service.apply(finalDir, {
      approvedLocators: [],
      approvedAssertions: [
        {
          pageObject: 'ProductsPage',
          methodName: 'expectCartBadgeCount',
          assertion: 'await expect(this.page.locator("[data-testid=\\"cart-badge\\"]")).toHaveText(expected);',
          reason: 'cart badge should match the expected count',
          expectedValue: '1',
        },
      ],
      rejectedLocators: [],
      rejectedAssertions: [],
      warnings: [],
      recommendationsUsed: 1,
      status: 'passed',
      failureCategory: 'locator',
      summary: 'ok',
    });

    const spec = fs.readFileSync(path.join(finalDir, 'src', 'tests', 'products.spec.ts'), 'utf8');
    const pageObject = fs.readFileSync(path.join(finalDir, 'src', 'pages', 'ProductsPage.ts'), 'utf8');

    expect(result.patchedFiles.length).toBeGreaterThan(0);
    expect(spec).toContain("await productsPage.expectCartBadgeCount('1');");
    expect(pageObject).toContain('async expectCartBadgeCount(expected: string): Promise<void>');
  });
});
