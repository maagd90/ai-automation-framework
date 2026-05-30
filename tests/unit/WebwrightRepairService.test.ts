import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TMP_BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'webwright-repair-'));

function makeRequest() {
  const finalDir = path.join(TMP_BASE, 'project');
  fs.mkdirSync(path.join(finalDir, 'src', 'pages'), { recursive: true });
  fs.mkdirSync(path.join(finalDir, 'src', 'tests'), { recursive: true });
  fs.mkdirSync(path.join(finalDir, 'src', 'test-data'), { recursive: true });
  fs.writeFileSync(path.join(finalDir, 'src', 'pages', 'LoginPage.ts'), 'export class LoginPage {}', 'utf8');
  fs.writeFileSync(
    path.join(finalDir, 'src', 'tests', 'login.spec.ts'),
    "import { LoginPage } from '../pages/LoginPage';\nimport loginData from '../test-data/login.data.json';\ntest('Login', async ({ page }) => {\n  const loginPage = new LoginPage(page);\n  await loginPage.enterUsername(loginData.validUser.username);\n});\n",
    'utf8',
  );
  fs.writeFileSync(
    path.join(finalDir, 'src', 'test-data', 'login.data.json'),
    JSON.stringify({
      validUser: { username: 'standard_user', password: 'secret_sauce' },
      invalidUser: { username: 'locked_out_user', password: 'wrong_password' },
      inputs: { searchTerm: 'bike' },
    }, null, 2),
    'utf8',
  );
  return {
    jobId: 'job-1',
    targetUrl: 'https://example.com',
    finalDir,
    failedSpecPath: path.join(finalDir, 'src', 'tests', 'login.spec.ts'),
    stdout: 'locator timeout while waiting for selector',
    stderr: 'element not found',
  };
}

describe('WebwrightRepairService', () => {
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

  it('returns a structured failure when the sidecar request fails', async () => {
    const { WebwrightRepairService } = await import('../../ai-agent-platform/apps/agent-api/src/services/webwright/WebwrightRepairService');
    const service = new WebwrightRepairService();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => 'sidecar exploded',
    })) as never);

    const result = await service.repair(makeRequest());

    expect(result.enabled).toBe(true);
    expect(result.status).toBe('failed');
    expect(result.summary).toContain('Webwright repair failed');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('parses a successful sidecar response', async () => {
    const { WebwrightRepairService } = await import('../../ai-agent-platform/apps/agent-api/src/services/webwright/WebwrightRepairService');
    const service = new WebwrightRepairService();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        status: 'passed',
        failureCategory: 'locator',
        summary: 'repair success',
        suggestedLocators: [
          {
            pageObject: 'LoginPage',
            fieldName: 'loginButton',
            target: 'Login button',
            selector: "page.getByRole('button', { name: 'Login' })",
            strategy: 'getByRole',
            confidenceScore: 0.95,
            reason: 'semantic button',
          },
        ],
        suggestedAssertions: [],
        patchSuggestions: [],
        warnings: [],
        screenshots: [],
      }),
    })) as never);

    const result = await service.repair(makeRequest());

    expect(result.enabled).toBe(true);
    expect(result.status).toBe('passed');
    expect(result.repairApplied).toBe(true);
    expect(result.suggestedLocators).toHaveLength(1);
    expect(result.generatedData.credentials.validUser.username).toBe('standard_user');
    expect(result.replayPlan.steps.length).toBeGreaterThan(0);
    expect(result.pageObjects.map((pageObject) => pageObject.className)).toContain('LoginPage');
  });
});
