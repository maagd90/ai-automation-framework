import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const TMP_BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'webwright-flow-'));

function createProject() {
  const finalDir = path.join(TMP_BASE, 'project');
  fs.mkdirSync(path.join(finalDir, 'src', 'pages'), { recursive: true });
  fs.mkdirSync(path.join(finalDir, 'src', 'tests'), { recursive: true });
  fs.mkdirSync(path.join(finalDir, 'src', 'test-data'), { recursive: true });
  fs.writeFileSync(
    path.join(finalDir, 'src', 'pages', 'LoginPage.ts'),
    [
      "import { type Page } from '@playwright/test';",
      'export class LoginPage {',
      '  private readonly usernameField = this.page.getByPlaceholder(\'Username\');',
      '  private readonly passwordField = this.page.getByPlaceholder(\'Password\');',
      '  private readonly loginButton = this.page.getByRole(\'button\', { name: \'Login\' });',
      '  constructor(private readonly page: Page) {}',
      '  async enterUsername(value: string): Promise<void> { await this.usernameField.fill(value); }',
      '  async enterPassword(value: string): Promise<void> { await this.passwordField.fill(value); }',
      '  async clickLogin(): Promise<void> { await this.loginButton.click(); }',
      '}',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(finalDir, 'src', 'pages', 'ProductsPage.ts'),
    [
      "import { type Page } from '@playwright/test';",
      'export class ProductsPage {',
      '  private readonly cartButton = this.page.getByRole(\'button\', { name: \'Cart\' });',
      '  constructor(private readonly page: Page) {}',
      '  async openCart(): Promise<void> { await this.cartButton.click(); }',
      '}',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(finalDir, 'src', 'tests', 'login.spec.ts'),
    [
      "import { LoginPage } from '../pages/LoginPage';",
      "import { ProductsPage } from '../pages/ProductsPage';",
      "import loginData from '../test-data/login.data.json';",
      "test('Login and open cart', async ({ page }) => {",
      '  const loginPage = new LoginPage(page);',
      '  const productsPage = new ProductsPage(page);',
      '  await loginPage.enterUsername(loginData.validUser.username);',
      '  await loginPage.enterPassword(loginData.validUser.password);',
      '  await loginPage.clickLogin();',
      '  await productsPage.openCart();',
      '});',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(finalDir, 'src', 'test-data', 'login.data.json'),
    JSON.stringify({
      validUser: { username: 'standard_user', password: 'secret_sauce' },
      invalidUser: { username: 'locked_out_user', password: 'wrong_password' },
      inputs: {},
    }, null, 2),
    'utf8',
  );
  return finalDir;
}

describe('Webwright repair flow', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ENABLE_WEBWRIGHT = 'true';
    process.env.WEBWRIGHT_DOCKER_ONLY = 'false';
    process.env.WEBWRIGHT_MODE = 'repair';
    process.env.WEBWRIGHT_SERVICE_URL = 'http://webwright:3002';
    process.env.WEBWRIGHT_OUTPUT_DIR = TMP_BASE;
    process.env.WEBWRIGHT_TIMEOUT_SECONDS = '5';
  });

  afterEach(() => {
    delete process.env.ENABLE_WEBWRIGHT;
    delete process.env.WEBWRIGHT_DOCKER_ONLY;
    delete process.env.WEBWRIGHT_MODE;
    delete process.env.WEBWRIGHT_SERVICE_URL;
    delete process.env.WEBWRIGHT_OUTPUT_DIR;
    delete process.env.WEBWRIGHT_TIMEOUT_SECONDS;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('replays deterministic steps, validates mapped POMs, and patches the existing page object', async () => {
    const finalDir = createProject();
    const { WebwrightRepairService } = await import('../../ai-agent-platform/apps/agent-api/src/services/webwright/WebwrightRepairService');
    const { WebwrightSuggestionValidator } = await import('../../ai-agent-platform/apps/agent-api/src/services/webwright/WebwrightSuggestionValidator');
    const { WebwrightPatchService } = await import('../../ai-agent-platform/apps/agent-api/src/services/webwright/WebwrightPatchService');

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        status: 'passed',
        failureCategory: 'locator',
        summary: 'repair success',
        suggestedLocators: [
          {
            pageObject: 'ProductsPage',
            fieldName: 'cartButton',
            target: 'Cart button',
            selector: "page.getByRole('button', { name: 'Cart' })",
            strategy: 'getByRole',
            confidenceScore: 0.95,
            reason: 'semantic cart button',
          },
        ],
        suggestedAssertions: [],
        patchSuggestions: [],
        warnings: [],
        screenshots: [],
      }),
    })) as never);

    const repairService = new WebwrightRepairService();
    const repair = await repairService.repair({
      jobId: 'job-1',
      targetUrl: 'https://example.com',
      finalDir,
      failedSpecPath: path.join(finalDir, 'src', 'tests', 'login.spec.ts'),
      stdout: 'locator timeout while waiting for selector',
      stderr: '',
    });

    const state = { phase: 'login' };
    const browser = {
      newPage: async () => ({
        async goto() { state.phase = 'login'; },
        async close() { return undefined; },
        async waitForLoadState() { return undefined; },
        async title() { return 'Products'; },
        locator(selector: string) {
          return {
            async count() {
              if (selector.includes('Username') || selector.includes('Password') || selector.includes('Login')) {
                return state.phase === 'login' ? 1 : 0;
              }
              if (selector.includes('Cart')) return state.phase === 'products' ? 1 : 0;
              return 0;
            },
            async fill() { return undefined; },
            async click() {
              if (selector.includes('Login')) state.phase = 'products';
              return undefined;
            },
            async waitFor() { return undefined; },
          };
        },
        getByLabel(label: string) { return this.locator(`label:${label}`); },
        getByRole(role: string, options?: { name?: string }) { return this.locator(`${role}:${options?.name ?? ''}`); },
        getByPlaceholder(value: string) { return this.locator(`placeholder:${value}`); },
        getByTestId(value: string) { return this.locator(`testid:${value}`); },
      }),
      close: async () => undefined,
    };

    const validator = new WebwrightSuggestionValidator(async () => browser as never);
    const validated = await validator.validate(repair, 'https://example.com', {
      generatedData: repair.generatedData,
      replayPlan: repair.replayPlan,
    });

    const patchService = new WebwrightPatchService();
    const patched = patchService.apply(finalDir, validated, repair.pageObjects);

    expect(repair.generatedData.credentials.validUser.username).toBe('standard_user');
    expect(repair.replayPlan.steps.some((step) => step.action === 'fill')).toBe(true);
    expect(validated.approvedLocators).toHaveLength(1);
    expect(patched.patchedFiles.length).toBeGreaterThan(0);
    expect(fs.readFileSync(path.join(finalDir, 'src', 'pages', 'ProductsPage.ts'), 'utf8')).toContain("getByRole('button', { name: 'Cart' })");
  });
});
