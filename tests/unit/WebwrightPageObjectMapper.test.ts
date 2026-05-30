import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { WebwrightPageObjectMapper } from '../../ai-agent-platform/apps/agent-api/src/services/webwright/WebwrightPageObjectMapper';

describe('WebwrightPageObjectMapper', () => {
  const createProject = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webwright-pom-'));
    fs.mkdirSync(path.join(dir, 'src', 'pages'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'src', 'tests'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'src', 'locators'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src', 'pages', 'LoginPage.ts'),
      [
        "import { type Page } from '@playwright/test';",
        'export class LoginPage {',
        '  private readonly usernameField = this.page.getByLabel(\'Username\');',
        '  constructor(private readonly page: Page) {}',
        '  async enterUsername(value: string): Promise<void> { await this.usernameField.fill(value); }',
        '}',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(dir, 'src', 'pages', 'ProductsPage.ts'),
      [
        "import { type Page } from '@playwright/test';",
        'export class ProductsPage {',
        '  private readonly cartButton = this.page.getByRole(\'button\', { name: \'Cart\' });',
        '  constructor(private readonly page: Page) {}',
        '  async openCart(): Promise<void> { await this.cartButton.click(); }',
        '}',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(dir, 'src', 'tests', 'login.spec.ts'),
      "import { LoginPage } from '../pages/LoginPage';\n",
    );
    fs.writeFileSync(
      path.join(dir, 'src', 'locators', 'login.locators.json'),
      JSON.stringify({
        feature: 'login',
        pageObject: 'LoginPage',
        locators: [{ name: 'usernameField', selector: "page.getByLabel('Username')" }],
      }, null, 2),
    );
    return dir;
  };

  it('collects existing generated POM metadata', () => {
    const mapper = new WebwrightPageObjectMapper();
    const pageObjects = mapper.collect(createProject());

    const loginPage = pageObjects.find((pageObject) => pageObject.className === 'LoginPage');
    expect(loginPage?.locatorFields[0].selector).toContain('Username');
    expect(loginPage?.methods.some((method) => method.name === 'enterUsername')).toBe(true);
    expect(loginPage?.relatedSpecImports).toContain('../pages/LoginPage');
    expect(loginPage?.locatorJsonPath).toContain('login.locators.json');
  });

  it('maps failures to existing generated page objects', () => {
    const mapper = new WebwrightPageObjectMapper();
    const pageObjects = mapper.collect(createProject());
    const result = mapper.map({
      failedSpecPath: path.join(createProject(), 'src', 'tests', 'login.spec.ts'),
      failedMethod: 'enterUsername',
      failedPageObject: 'LoginPage',
    }, pageObjects);

    expect(result.pageObject?.className).toBe('LoginPage');
    expect(result.reason).toContain('matched');
  });

  it('rejects unmappable page objects', () => {
    const mapper = new WebwrightPageObjectMapper();
    const pageObjects = mapper.collect(createProject());
    const result = mapper.map({ failedPageObject: 'InventoryPage', failedMethod: 'doesNotExist' }, pageObjects);

    expect(result.pageObject).toBeUndefined();
    expect(result.warnings.some((warning) => warning.includes('No safe page object mapping'))).toBe(true);
  });
});
