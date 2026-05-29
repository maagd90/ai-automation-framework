import fs from 'fs';
import path from 'path';
import type { TestCase, WebwrightMode, WebwrightStatus } from '@ai-agent/shared-types';
import { webwrightConfig } from './WebwrightConfig';
import { WebwrightTaskBuilder } from './WebwrightTaskBuilder';
import { WebwrightResultParser, type ParsedWebwrightResult } from './WebwrightResultParser';
import { WebwrightScriptReviewer } from './WebwrightScriptReviewer';
import { logger } from '../../utils/logger';

export interface WebwrightSidecarOptions {
  jobId: string;
  targetUrl: string;
  testCases: TestCase[];
  mode?: WebwrightMode;
  /** Logs from a previous failed execution, used in repair mode. */
  failedExecutionLogs?: string;
  /** Generated spec source files, used in repair mode. */
  generatedSpecSources?: string[];
}

export interface WebwrightSidecarResult {
  status: WebwrightStatus;
  summary: string;
  parsed?: ParsedWebwrightResult;
  recommendationsUsed: number;
  repairApplied: boolean;
  warnings: string[];
  skipped: boolean;
}

function isInsideDocker(): boolean {
  return (
    process.env.IN_DOCKER === 'true' ||
    process.env.PLAYWRIGHT_BROWSERS_PATH === '/ms-playwright' ||
    fs.existsSync('/.dockerenv')
  );
}

/**
 * Orchestrates the optional Webwright browser-agent sidecar.
 *
 * When disabled (ENABLE_WEBWRIGHT=false or mode=disabled), all methods return
 * immediately with a skipped result — no remote sidecar request is made.
 *
 * Security contract:
 * - Only runs if ENABLE_WEBWRIGHT=true.
 * - In WEBWRIGHT_DOCKER_ONLY=true mode (default), refuses to run outside Docker.
 * - The sidecar service writes only inside its job-scoped output directory.
 * - Secrets are never passed around in plain text.
 */
export class WebwrightSidecarService {
  private readonly taskBuilder = new WebwrightTaskBuilder();
  private readonly resultParser = new WebwrightResultParser();
  private readonly scriptReviewer = new WebwrightScriptReviewer();

  /**
   * Determines whether the sidecar should run for the given context.
   *
   * Reads ENABLE_WEBWRIGHT and WEBWRIGHT_DOCKER_ONLY from process.env at call
   * time so that tests can control the values via beforeEach/afterEach.
   *
   * Returns false (skip) when:
   * - ENABLE_WEBWRIGHT is not 'true'
   * - mode is 'disabled'
   * - WEBWRIGHT_DOCKER_ONLY is not 'false' and we are not inside Docker
   */
  shouldRun(mode?: WebwrightMode): boolean {
    if (process.env.ENABLE_WEBWRIGHT !== 'true') return false;
    const effectiveMode = mode ?? (process.env.WEBWRIGHT_MODE as WebwrightMode | undefined) ?? 'disabled';
    if (effectiveMode === 'disabled') return false;
    const dockerOnly = process.env.WEBWRIGHT_DOCKER_ONLY !== 'false';
    if (dockerOnly && !isInsideDocker()) {
      logger.warn('[Webwright] WEBWRIGHT_DOCKER_ONLY=true but not running in Docker — sidecar skipped');
      return false;
    }
    return true;
  }

  /**
   * Runs the Webwright sidecar for the given job context.
   *
   * If the sidecar is disabled or should not run, returns a skipped result
   * immediately without spawning any process.
   *
   * @param opts - Job context: jobId, targetUrl, testCases, mode, optional repair inputs.
   * @returns A WebwrightSidecarResult with parsed/reviewed recommendations.
   */
  async run(opts: WebwrightSidecarOptions): Promise<WebwrightSidecarResult> {
    const mode = opts.mode ?? webwrightConfig.WEBWRIGHT_MODE;

    if (!this.shouldRun(mode)) {
      return {
        status: 'skipped',
        summary: 'Webwright sidecar is disabled',
        recommendationsUsed: 0,
        repairApplied: false,
        warnings: [],
        skipped: true,
      };
    }

    const jobOutputDir = path.join(webwrightConfig.WEBWRIGHT_OUTPUT_DIR, opts.jobId);
    fs.mkdirSync(jobOutputDir, { recursive: true });

    const task = this.taskBuilder.build(opts.testCases, opts.targetUrl);
    const inputPayload = {
      task,
      mode,
      targetUrl: opts.targetUrl,
      outputDir: jobOutputDir,
      timeoutSeconds: webwrightConfig.WEBWRIGHT_TIMEOUT_SECONDS,
      allowedDomains: webwrightConfig.WEBWRIGHT_ALLOWED_DOMAINS
        ? webwrightConfig.WEBWRIGHT_ALLOWED_DOMAINS.split(',').map((d) => d.trim()).filter(Boolean)
        : [],
      failedExecutionLogs: opts.failedExecutionLogs,
      generatedSpecSources: opts.generatedSpecSources,
    };

    const inputFile = path.join(jobOutputDir, 'input.json');
    fs.writeFileSync(inputFile, JSON.stringify(inputPayload, null, 2), 'utf8');

    logger.info('[Webwright] Starting sidecar', { jobId: opts.jobId, mode, targetUrl: opts.targetUrl });

    let rawOutput: string;
    try {
      rawOutput = await this.postToSidecar(inputPayload);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[Webwright] Sidecar request failed', { jobId: opts.jobId, error: message });
      return {
        status: 'failed',
        summary: `Webwright sidecar failed: ${message}`,
        recommendationsUsed: 0,
        repairApplied: false,
        warnings: [`Sidecar error: ${message}`],
        skipped: false,
      };
    }

    let parsed: ParsedWebwrightResult;
    try {
      parsed = this.resultParser.parse(rawOutput);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[Webwright] Failed to parse sidecar output', { jobId: opts.jobId, error: message });
      return {
        status: 'failed',
        summary: `Webwright output parsing failed: ${message}`,
        recommendationsUsed: 0,
        repairApplied: false,
        warnings: [`Parse error: ${message}`],
        skipped: false,
      };
    }

    const reviewResult = this.scriptReviewer.review(
      parsed.recommendedLocators,
      parsed.recommendedAssertions,
    );

    const recommendationsUsed =
      reviewResult.approved.length + reviewResult.approvedAssertions.length;
    const repairApplied = mode === 'repair' && reviewResult.approved.length > 0;

    const allWarnings = [
      ...parsed.warnings,
      ...reviewResult.issues.map((i) => i.message),
    ];

    logger.info('[Webwright] Sidecar completed', {
      jobId: opts.jobId,
      status: parsed.status,
      recommendationsUsed,
      repairApplied,
      warnings: allWarnings.length,
    });

    return {
      status: parsed.status,
      summary: parsed.summary,
      parsed,
      recommendationsUsed,
      repairApplied,
      warnings: allWarnings,
      skipped: false,
    };
  }

  private async postToSidecar(payload: unknown): Promise<string> {
    const controller = new AbortController();
    const timeoutSeconds = Number(process.env.WEBWRIGHT_TIMEOUT_SECONDS ?? webwrightConfig.WEBWRIGHT_TIMEOUT_SECONDS);
    const timer = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

    try {
      const response = await fetch(`${webwrightConfig.WEBWRIGHT_SERVICE_URL}/repair`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const body = await response.text();
      if (!response.ok) {
        throw new Error(body || `Webwright sidecar returned HTTP ${response.status}`);
      }
      return body;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Webwright sidecar request failed: ${message}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
