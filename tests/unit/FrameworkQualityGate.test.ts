import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FrameworkQualityGate } from '../../ai-agent-platform/apps/agent-api/src/services/batch/FrameworkQualityGate';

describe('FrameworkQualityGate', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
  });

  const createProject = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-gate-'));
    tempDirs.push(dir);
    for (const subdir of ['src/tests', 'src/pages', 'src/test-data', 'src/locators']) {
      fs.mkdirSync(path.join(dir, subdir), { recursive: true });
    }
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      devDependencies: {
        '@playwright/test': '1.59.1',
        'allure-playwright': '^3.0.0',
        'allure-commandline': '^2.30.0',
        typescript: '^5.3.3',
      },
    }, null, 2));
    fs.writeFileSync(path.join(dir, 'playwright.config.ts'), "export default { reporter: [ ['line'], ['html', { open: 'never' }], ['allure-playwright'] ] };");
    fs.writeFileSync(path.join(dir, 'src/pages/LoginPage.ts'), 'export class LoginPage {\n  async goto(): Promise<void> { return; }\n  async enterUsername(value: string): Promise<void> { return; }\n}\n');
    fs.writeFileSync(path.join(dir, 'src/test-data/login.data.json'), JSON.stringify({ validUser: { username: 'standard_user' } }, null, 2));
    fs.writeFileSync(path.join(dir, 'src/locators/login.locators.json'), JSON.stringify({
      feature: 'login',
      locators: [{ name: 'usernameField', selector: "page.getByPlaceholder('Username')", strategy: 'getByPlaceholder' }],
    }, null, 2));
    return dir;
  };

  it('passes valid generated framework artifacts', () => {
    const dir = createProject();
    fs.writeFileSync(path.join(dir, 'src/tests/login.spec.ts'), `
import { LoginPage } from '../pages/LoginPage';
import loginData from '../test-data/login.data.json';
test('Login with valid credentials', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.enterUsername(loginData.validUser.username);
});
`);
    const gate = new FrameworkQualityGate();
    const runTscValidation = vi.fn();

    expect(() => gate.validate(dir, runTscValidation)).not.toThrow();
    expect(runTscValidation).toHaveBeenCalledWith(dir);
  });

  it('fails when generated data references are missing', () => {
    const dir = createProject();
    fs.writeFileSync(path.join(dir, 'src/tests/login.spec.ts'), `
import { LoginPage } from '../pages/LoginPage';
import loginData from '../test-data/login.data.json';
test('Login with valid credentials', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.enterUsername(loginData.validUser.password);
});
`);
    const gate = new FrameworkQualityGate();

    expect(() => gate.validate(dir, () => undefined)).toThrow(/does not contain validUser.password/);
  });

  it('passes zip readiness when report and allure artifacts are consistent', () => {
    const dir = createProject();
    fs.mkdirSync(path.join(dir, 'reports'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'allure-results'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'allure-report'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'reports', 'batch-execution-report.json'), JSON.stringify({ status: 'passed' }, null, 2));

    const gate = new FrameworkQualityGate();

    expect(() =>
      gate.validateZipReadiness(dir, {
        executionMode: 'generate-and-execute',
        report: {
          generation: { total: 3, passed: 3, failed: 0 },
          execution: { enabled: true, total: 3, passed: 3, failed: 0, exitCode: 0 },
          allure: { configured: true, resultsGenerated: true, reportGenerated: true },
        },
      }),
    ).not.toThrow();
  });

  it('fails zip readiness when forbidden artifacts remain', () => {
    const dir = createProject();
    fs.mkdirSync(path.join(dir, 'reports'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'reports', 'batch-execution-report.json'), JSON.stringify({ status: 'passed' }, null, 2));
    fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true });

    const gate = new FrameworkQualityGate();

    expect(() => gate.validateZipReadiness(dir, {})).toThrow(/Forbidden artifact found/);
  });

  it('fails zip readiness when execution or allure status is inconsistent with artifacts', () => {
    const dir = createProject();
    fs.mkdirSync(path.join(dir, 'reports'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'reports', 'batch-execution-report.json'), JSON.stringify({ status: 'partial' }, null, 2));

    const gate = new FrameworkQualityGate();

    expect(() =>
      gate.validateZipReadiness(dir, {
        executionMode: 'generate-and-execute',
        report: {
          generation: { total: 3, passed: 3, failed: 0 },
          execution: { enabled: false, total: 3, passed: 3, failed: 0, exitCode: 0 },
          allure: { configured: true, resultsGenerated: true, reportGenerated: true },
        },
      }),
    ).toThrow(/Execution mode is generate-and-execute|allure-results|allure-report/);
  });
});
