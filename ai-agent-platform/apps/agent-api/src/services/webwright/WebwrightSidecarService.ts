import { spawn } from 'child_process';
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

const SIDECAR_RUNNER_PATH = path.resolve(
  new URL(import.meta.url).pathname,
  '../../../../../../../../../../webwright-sidecar/runner.py',
);

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
 * immediately with a skipped result — no external process is spawned and no
 * filesystem I/O is performed.
 *
 * Security contract:
 * - Only runs if ENABLE_WEBWRIGHT=true.
 * - In WEBWRIGHT_DOCKER_ONLY=true mode (default), refuses to run outside Docker.
 * - The sidecar process writes only inside its job-scoped output directory.
 * - Secrets are never passed as CLI arguments; they are redacted from logs.
 * - The process is killed hard after WEBWRIGHT_TIMEOUT_SECONDS.
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
      rawOutput = await this.spawnSidecar(inputFile, jobOutputDir);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[Webwright] Sidecar process failed', { jobId: opts.jobId, error: message });
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

  private spawnSidecar(inputFile: string, outputDir: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeoutSeconds = Number(process.env.WEBWRIGHT_TIMEOUT_SECONDS ?? webwrightConfig.WEBWRIGHT_TIMEOUT_SECONDS);
      const timeoutMs = timeoutSeconds * 1000;
      const args = ['--input', inputFile, '--output-dir', outputDir];

      const child = spawn('python3', [SIDECAR_RUNNER_PATH, ...args], {
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        // Redact anything that looks like a secret before logging
        const line = chunk.toString().replace(/(?:key|token|password|secret)=\S+/gi, '[REDACTED]');
        stderr += line;
      });

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`Webwright sidecar timed out after ${timeoutSeconds}s`));
      }, timeoutMs);

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          const detail = stderr.slice(-1000);
          reject(new Error(`Sidecar exited with code ${code ?? 'null'}. stderr: ${detail}`));
          return;
        }
        // Prefer the structured output file written by the sidecar if present
        const outputFile = path.join(outputDir, 'result.json');
        if (fs.existsSync(outputFile)) {
          resolve(fs.readFileSync(outputFile, 'utf8'));
        } else {
          resolve(stdout);
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}
