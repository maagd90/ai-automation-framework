import fs from 'fs';
import path from 'path';
import type { CaseStatus, TestCaseResult } from '@ai-agent/shared-types';

interface PlaywrightJsonReport {
  suites?: PlaywrightSuite[];
}

interface PlaywrightSuite {
  title?: string;
  specs?: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
}

interface PlaywrightSpec {
  title?: string;
  tests?: PlaywrightTest[];
}

interface PlaywrightTest {
  status?: string;
  results?: Array<{
    status?: string;
    duration?: number;
    error?: { message?: string };
    attachments?: Array<{ name?: string; path?: string; contentType?: string }>;
  }>;
}

export class PlaywrightReportParser {
  parse(reportPath: string, jobId: string): TestCaseResult[] {
    if (!fs.existsSync(reportPath)) {
      return [];
    }

    const raw = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as PlaywrightJsonReport;
    const results: TestCaseResult[] = [];

    const walk = (suites: PlaywrightSuite[] | undefined): void => {
      for (const suite of suites ?? []) {
        for (const spec of suite.specs ?? []) {
          const test = spec.tests?.[0];
          const result = test?.results?.[0];
          const title = spec.title ?? 'Unknown test';
          const idMatch = title.match(/^(TC-[^:]+):/);
          const id = idMatch?.[1] ?? title;

          const screenshot = result?.attachments?.find((a) =>
            a.contentType?.startsWith('image/'),
          );
          const trace = result?.attachments?.find((a) =>
            a.name === 'trace' || a.path?.endsWith('.zip'),
          );

          results.push({
            id,
            name: title.replace(/^TC-[^:]+:\s*/, ''),
            generationStatus: 'passed',
            executionStatus: this.mapStatus(result?.status ?? test?.status),
            durationMs: result?.duration ?? 0,
            error: result?.error?.message,
            screenshotUrl: screenshot?.path
              ? `/api/jobs/${jobId}/artifacts/${encodeURIComponent(id)}/screenshot`
              : undefined,
            traceUrl: trace?.path
              ? `/api/jobs/${jobId}/artifacts/${encodeURIComponent(id)}/trace`
              : undefined,
            steps: [],
          });
        }
        walk(suite.suites);
      }
    };

    walk(raw.suites);
    return results;
  }

  private mapStatus(status?: string): CaseStatus {
    if (status === 'passed') return 'passed';
    if (status === 'skipped') return 'skipped';
    return 'failed';
  }
}

export function findArtifactPath(projectDir: string, _testCaseId: string, kind: 'screenshot' | 'trace'): string | undefined {
  const testResultsDir = path.join(projectDir, 'test-results');
  if (!fs.existsSync(testResultsDir)) return undefined;

  const files = findFilesRecursive(testResultsDir);
  if (kind === 'screenshot') {
    return files.find((file) => file.endsWith('.png'));
  }
  if (kind === 'trace') {
    return files.find((file) => file.endsWith('.zip'));
  }
  return undefined;
}

function findFilesRecursive(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFilesRecursive(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}
