import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('archiver', () => ({
  default: () => ({
    on: vi.fn(),
    pipe: vi.fn(),
    directory: vi.fn(),
    finalize: vi.fn().mockResolvedValue(undefined),
  }),
}));

import { WebwrightSidecarService } from '../../ai-agent-platform/apps/agent-api/src/services/webwright/WebwrightSidecarService';

describe('WebwrightSidecarService', () => {
  let service: WebwrightSidecarService;

  beforeEach(() => {
    service = new WebwrightSidecarService();
    delete process.env.ENABLE_WEBWRIGHT;
    delete process.env.WEBWRIGHT_DOCKER_ONLY;
    delete process.env.WEBWRIGHT_MODE;
    delete process.env.WEBWRIGHT_SERVICE_URL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns false when Webwright is disabled', () => {
    expect(service.shouldRun('disabled')).toBe(false);
    expect(service.shouldRun(undefined)).toBe(false);
  });

  it('returns a skipped result immediately when disabled', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy as never);

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
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns failed status when the sidecar request fails', async () => {
    process.env.ENABLE_WEBWRIGHT = 'true';
    process.env.WEBWRIGHT_DOCKER_ONLY = 'false';
    process.env.WEBWRIGHT_MODE = 'deep-review';
    process.env.WEBWRIGHT_SERVICE_URL = 'http://webwright:3002';
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => 'sidecar exploded',
    })) as never);

    const result = await service.run({
      jobId: 'test-job-2',
      targetUrl: 'https://example.com',
      testCases: [],
      mode: 'deep-review',
    });

    expect(result.skipped).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.summary).toContain('sidecar');
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
