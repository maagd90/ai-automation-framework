import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We test only the parts of WebwrightSidecarService that do not require
// spawning a real Python process (disabled mode, shouldRun logic, timeout
// contract, and invalid JSON output handling). Integration-level tests that
// actually launch the Python sidecar belong in a separate E2E suite.

// Prevent child_process.spawn from actually spawning anything in unit tests.
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// archiver is a native Node add-on only available in the platform workspace.
vi.mock('archiver', () => ({
  default: () => ({
    on: vi.fn(),
    pipe: vi.fn(),
    directory: vi.fn(),
    finalize: vi.fn().mockResolvedValue(undefined),
  }),
}));

import { WebwrightSidecarService } from '../../ai-agent-platform/apps/agent-api/src/services/webwright/WebwrightSidecarService';

describe('WebwrightSidecarService — shouldRun', () => {
  const service = new WebwrightSidecarService();

  it('returns false when ENABLE_WEBWRIGHT is not set', () => {
    delete process.env.ENABLE_WEBWRIGHT;
    // The config is read at module import time, so we test through the method
    // by passing an explicit mode argument.
    expect(service.shouldRun('disabled')).toBe(false);
  });

  it('returns false when mode is "disabled"', () => {
    expect(service.shouldRun('disabled')).toBe(false);
  });

  it('returns false when mode is undefined (resolves to disabled by default)', () => {
    // With ENABLE_WEBWRIGHT unset the method must return false regardless of mode.
    delete process.env.ENABLE_WEBWRIGHT;
    expect(service.shouldRun(undefined)).toBe(false);
  });
});

describe('WebwrightSidecarService — run (disabled mode)', () => {
  let service: WebwrightSidecarService;

  beforeEach(() => {
    delete process.env.ENABLE_WEBWRIGHT;
    service = new WebwrightSidecarService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a skipped result immediately when disabled', async () => {
    const result = await service.run({
      jobId: 'test-job-1',
      targetUrl: 'https://example.com',
      testCases: [],
      mode: 'disabled',
    });
    expect(result.skipped).toBe(true);
    expect(result.status).toBe('skipped');
    expect(result.recommendationsUsed).toBe(0);
    expect(result.repairApplied).toBe(false);
  });

  it('does not call spawn when disabled', async () => {
    const { spawn } = await import('child_process');
    await service.run({
      jobId: 'test-job-2',
      targetUrl: 'https://example.com',
      testCases: [],
      mode: 'disabled',
    });
    expect(spawn).not.toHaveBeenCalled();
  });
});

describe('WebwrightSidecarService — run (enabled, spawn failure)', () => {
  let service: WebwrightSidecarService;

  beforeEach(() => {
    process.env.ENABLE_WEBWRIGHT = 'true';
    process.env.WEBWRIGHT_DOCKER_ONLY = 'false';
    process.env.WEBWRIGHT_MODE = 'deep-review';
    service = new WebwrightSidecarService();
  });

  afterEach(() => {
    delete process.env.ENABLE_WEBWRIGHT;
    delete process.env.WEBWRIGHT_DOCKER_ONLY;
    delete process.env.WEBWRIGHT_MODE;
    vi.restoreAllMocks();
  });

  it('returns failed status when spawn throws an ENOENT error', async () => {
    const { spawn } = await import('child_process');
    const mockChild = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn((event: string, cb: (arg: unknown) => void) => {
        if (event === 'error') {
          // Simulate ENOENT — python3 not found
          setTimeout(() => cb(new Error('spawn python3 ENOENT')), 0);
        }
      }),
      kill: vi.fn(),
    };
    vi.mocked(spawn).mockReturnValue(mockChild as never);

    const result = await service.run({
      jobId: 'test-job-3',
      targetUrl: 'https://example.com',
      testCases: [],
      mode: 'deep-review',
    });

    expect(result.skipped).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('returns failed status when sidecar exits with non-zero code', async () => {
    const { spawn } = await import('child_process');
    const mockChild = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn((_, cb) => cb(Buffer.from('traceback'))) },
      on: vi.fn((event: string, cb: (code: number | null) => void) => {
        if (event === 'close') {
          setTimeout(() => cb(1), 0);
        }
      }),
      kill: vi.fn(),
    };
    vi.mocked(spawn).mockReturnValue(mockChild as never);

    const result = await service.run({
      jobId: 'test-job-4',
      targetUrl: 'https://example.com',
      testCases: [],
      mode: 'deep-review',
    });

    expect(result.status).toBe('failed');
    expect(result.summary).toContain('failed');
  });

  it('returns failed status when sidecar outputs invalid JSON', async () => {
    const { spawn } = await import('child_process');
    const mockChild = {
      stdout: { on: vi.fn((_, cb) => cb(Buffer.from('not-json-output'))) },
      stderr: { on: vi.fn() },
      on: vi.fn((event: string, cb: (code: number | null) => void) => {
        if (event === 'close') {
          setTimeout(() => cb(0), 0);
        }
      }),
      kill: vi.fn(),
    };
    vi.mocked(spawn).mockReturnValue(mockChild as never);

    const result = await service.run({
      jobId: 'test-job-5',
      targetUrl: 'https://example.com',
      testCases: [],
      mode: 'exploration',
    });

    expect(result.status).toBe('failed');
    expect(result.summary).toContain('parsing failed');
  });

  it('applies timeout and returns failed status', async () => {
    vi.useFakeTimers();
    const { spawn } = await import('child_process');
    const mockChild = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      // 'close' event never fires — simulates a hung process
      on: vi.fn(),
      kill: vi.fn(),
    };
    vi.mocked(spawn).mockReturnValue(mockChild as never);
    process.env.WEBWRIGHT_TIMEOUT_SECONDS = '1';

    const runPromise = service.run({
      jobId: 'test-job-6',
      targetUrl: 'https://example.com',
      testCases: [],
      mode: 'deep-review',
    });

    // Flush all pending timers (including the 1s timeout) then drain microtasks
    await vi.runAllTimersAsync();
    const result = await runPromise;

    expect(mockChild.kill).toHaveBeenCalledWith('SIGKILL');
    expect(result.status).toBe('failed');
    expect(result.summary).toContain('timed out');

    vi.useRealTimers();
    delete process.env.WEBWRIGHT_TIMEOUT_SECONDS;
  });
});

describe('WebwrightSidecarService — ZIP exclusion contract', () => {
  it('webwright-sidecar is excluded from generated ZIP', async () => {
    const { shouldExcludeZipEntry } = await import('../../ai-agent-platform/apps/agent-api/src/services/ZipService');
    expect(shouldExcludeZipEntry('webwright-sidecar/runner.py')).toBe(true);
    expect(shouldExcludeZipEntry('webwright-sidecar/requirements.txt')).toBe(true);
    expect(shouldExcludeZipEntry('.venv/lib/python3.11/site-packages/playwright/__init__.py')).toBe(true);
    expect(shouldExcludeZipEntry('__pycache__/runner.cpython-311.pyc')).toBe(true);
    expect(shouldExcludeZipEntry('src/pages/LoginPage.ts')).toBe(false);
  });

  it('.pyc and .pyo files are excluded', async () => {
    const { shouldExcludeZipEntry } = await import('../../ai-agent-platform/apps/agent-api/src/services/ZipService');
    expect(shouldExcludeZipEntry('src/runner.pyc')).toBe(true);
    expect(shouldExcludeZipEntry('src/helper.pyo')).toBe(true);
  });
});

describe('WebwrightSidecarService — report integration', () => {
  it('BatchReportService includes webwright section when provided', async () => {
    const { BatchReportService } = await import('../../ai-agent-platform/apps/agent-api/src/services/batch/BatchReportService');
    const reporter = new BatchReportService();
    const report = reporter.build({
      startedAt: Date.now() - 5000,
      childResults: [{ childId: 'c1', exitCode: 0, stdout: '', stderr: '' }],
      parallelAgents: 1,
      executionMode: 'generate-only',
      webwright: {
        enabled: true,
        mode: 'deep-review',
        status: 'passed',
        repairApplied: false,
        recommendationsUsed: 3,
        warnings: [],
      },
    });

    expect(report.webwright).toBeDefined();
    expect(report.webwright?.enabled).toBe(true);
    expect(report.webwright?.mode).toBe('deep-review');
    expect(report.webwright?.recommendationsUsed).toBe(3);
  });

  it('BatchReportService omits webwright section when not provided', async () => {
    const { BatchReportService } = await import('../../ai-agent-platform/apps/agent-api/src/services/batch/BatchReportService');
    const reporter = new BatchReportService();
    const report = reporter.build({
      startedAt: Date.now() - 5000,
      childResults: [{ childId: 'c1', exitCode: 0, stdout: '', stderr: '' }],
      parallelAgents: 1,
    });

    expect(report.webwright).toBeUndefined();
  });
});
