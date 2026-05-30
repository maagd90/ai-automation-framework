import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { WebwrightFailureContextExtractor } from '../../ai-agent-platform/apps/agent-api/src/services/webwright/WebwrightFailureContextExtractor';
import { WebwrightPageObjectMapper } from '../../ai-agent-platform/apps/agent-api/src/services/webwright/WebwrightPageObjectMapper';

describe('WebwrightFailureContextExtractor', () => {
  const createProject = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webwright-failure-'));
    fs.mkdirSync(path.join(dir, 'src', 'pages'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'src', 'tests'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src', 'pages', 'LoginPage.ts'),
      [
        "import { type Page } from '@playwright/test';",
        'export class LoginPage {',
        '  private readonly usernameField = this.page.getByLabel(\'Username\');',
        '  constructor(private readonly page: Page) {}',
        '  async enterUsername(value: string): Promise<void> {',
        '    await this.usernameField.fill(value);',
        '  }',
        '}',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(dir, 'src', 'tests', 'login.spec.ts'),
      [
        "import { LoginPage } from '../pages/LoginPage';",
        "test('Login succeeds', async ({ page }) => {",
        '  const loginPage = new LoginPage(page);',
        "  await loginPage.enterUsername('standard_user');",
        "  await expect(page.locator('[data-testid=\"welcome\"]')).toHaveText('Welcome');",
        '});',
      ].join('\n'),
    );
    return dir;
  };

  it('extracts failed selector, method, and test title from locator timeouts', () => {
    const dir = createProject();
    const specPath = path.join(dir, 'src', 'tests', 'login.spec.ts');
    const mapper = new WebwrightPageObjectMapper();
    const extractor = new WebwrightFailureContextExtractor();
    const pageObjects = mapper.collect(dir);
    const result = extractor.extract({
      stdout: `locator timeout while waiting for selector\n at ${specPath}:4:3`,
      stderr: '',
      failedSpecPath: specPath,
      generatedSpecSources: [{ filePath: specPath, source: fs.readFileSync(specPath, 'utf8') }],
      pageObjects,
    });

    expect(result.failureContext.failedSpecPath).toBe(specPath);
    expect(result.failureContext.failedTestTitle).toBe('Login succeeds');
    expect(result.failureContext.failedMethod).toBe('enterUsername');
    expect(result.failureContext.failedPageObject).toBe('LoginPage');
    expect(result.failureContext.failureCategory).toBe('locator');
  });

  it('extracts assertion failures from Playwright output', () => {
    const dir = createProject();
    const specPath = path.join(dir, 'src', 'tests', 'login.spec.ts');
    const mapper = new WebwrightPageObjectMapper();
    const extractor = new WebwrightFailureContextExtractor();
    const pageObjects = mapper.collect(dir);
    const result = extractor.extract({
      stdout: '',
      stderr: `Error: expect(received).toHaveText(expected)\n at ${specPath}:5:3`,
      failedSpecPath: specPath,
      generatedSpecSources: [{ filePath: specPath, source: fs.readFileSync(specPath, 'utf8') }],
      pageObjects,
    });

    expect(result.failureContext.failedAssertion).toContain('toHaveText');
    expect(result.failureContext.failedSelector).toContain('welcome');
    expect(result.failureContext.failureCategory).toBe('assertion');
  });
});
