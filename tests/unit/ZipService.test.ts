import { describe, expect, it } from 'vitest';
import { shouldExcludeZipEntry } from '../../ai-agent-platform/apps/agent-api/src/services/ZipService';

describe('ZipService exclusion rules', () => {
  it('excludes runtime and IDE directories', () => {
    expect(shouldExcludeZipEntry('node_modules/package.json')).toBe(true);
    expect(shouldExcludeZipEntry('playwright-report/index.html')).toBe(true);
    expect(shouldExcludeZipEntry('test-results/results.json')).toBe(true);
    expect(shouldExcludeZipEntry('.idea/workspace.xml')).toBe(true);
    expect(shouldExcludeZipEntry('__MACOSX/._foo')).toBe(true);
  });

  it('excludes forbidden files and patterns', () => {
    expect(shouldExcludeZipEntry('.last-run.json')).toBe(true);
    expect(shouldExcludeZipEntry('nested/.DS_Store')).toBe(true);
    expect(shouldExcludeZipEntry('project/app.iml')).toBe(true);
  });

  it('allows expected generated artifacts', () => {
    expect(shouldExcludeZipEntry('reports/batch-execution-report.json')).toBe(false);
    expect(shouldExcludeZipEntry('allure-results/result.json')).toBe(false);
    expect(shouldExcludeZipEntry('allure-report/index.html')).toBe(false);
    expect(shouldExcludeZipEntry('src/pages/LoginPage.ts')).toBe(false);
  });
});
