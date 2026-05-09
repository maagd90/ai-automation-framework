import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import type { AiConfig, AiUsageSummary, FailureAnalysis } from '@ai-agent/shared-types';
import { AiPromptService, AiProviderFactory, TestCaseParserFactory, TestCaseBatchValidator, TestCaseSplitter, FeaturePartitioner } from '@ai-agent/agent-core';
import { JOBS_BASE_DIR, PLATFORM_BASE_DIR, REPO_ROOT_DIR } from '../../config';
import { runtimeConfig } from '../../config/runtime.config';
import { JobEntity } from '../../domain/Job';
import { jobStore } from '../JobStore';
import { playwrightReady } from '../PlaywrightReadinessCheck';
import { runtimeResourceService } from '../RuntimeResourceService';
import { AgentPoolManager } from './AgentPoolManager';
import { ReviewMergeService } from './ReviewMergeService';
import { BatchReportService } from './BatchReportService';
import { createNodeModulesLink, removeNodeModulesLink } from './FinalProjectRuntimeLinker';
import { logger } from '../../utils/logger';

/**
 * Orchestrates the full batch test generation pipeline for a single job.
 *
 * Responsibilities:
 * - Parses the uploaded test case file into individual test cases.
 * - Validates the batch and enforces per-job test case limits.
 * - Splits the batch into one file per test case for parallel processing.
 * - Dispatches child agent processes via AgentPoolManager.
 * - Merges all child outputs into a single final project using ProjectMerger.
 * - Optionally runs the generated Playwright tests (generate-and-execute mode).
 * - Builds and persists the execution report.
 * - Handles AI failure analysis when an AI provider is configured.
 */
export class BatchJobManager {
  private readonly pool = new AgentPoolManager();
  private readonly merger = new ReviewMergeService();
  private readonly reporter = new BatchReportService();
  private readonly aiPromptService = new AiPromptService();
  private readonly partitioner = new FeaturePartitioner();

  /**
   * Executes the full generation pipeline for the given job.
   *
   * Steps: parse → validate → split → run agents → merge → (optional) execute tests → report.
   * Updates job status and logs throughout. Writes a report.json to the job directory on completion.
   *
   * @param job - The job entity containing input file path, target URL, and execution settings.
   * @param aiConfig - Optional AI provider configuration for parsing assistance and failure analysis.
   * @param opts - Optional overrides (e.g. effectiveMaxTestCases from the HTTP request).
   */
  async run(job: JobEntity, aiConfig?: AiConfig, opts?: { effectiveMaxTestCases?: number }): Promise<void> {
    const logsFile = path.join(JOBS_BASE_DIR, job.jobId, 'logs.txt');
    const startedAt = Date.now();

    const log = (msg: string): void => {
      const entry = `[${new Date().toISOString()}] ${msg}`;
      job.addLog(entry);
      fs.appendFileSync(logsFile, entry + '\n');
      jobStore.set(job);
    };

    try {
      job.setStatus('running');
      log(`Job ${job.jobId} started`);
      log(`Target URL: ${job.url}`);
      log(`Execution mode: ${job.executionMode}`);
      log(`Parallel agents: ${job.parallelAgents}`);
      jobStore.set(job);
      logger.info('Job started', {
        jobId: job.jobId,
        url: job.url,
        executionMode: job.executionMode,
        parallelAgents: job.parallelAgents,
      });

      // ── Parse ─────────────────────────────────────────────────────────────
      log('Parsing test case file…');
      logger.info('Parsing test case file', { jobId: job.jobId, inputFile: job.inputFile });
      const content = fs.readFileSync(job.inputFile, 'utf8');
      const parser = new TestCaseParserFactory();
      const batch = parser.parse(job.inputFile, content);

      // ── Validate ──────────────────────────────────────────────────────────
      logger.info('Validating test case batch', { jobId: job.jobId });
      const validator = new TestCaseBatchValidator();
      const validation = validator.validate(batch);
      if (!validation.valid) {
        const msg = validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ');
        logger.error('Batch validation failed', { jobId: job.jobId, validationErrors: msg });
        throw new Error(`Batch validation failed: ${msg}`);
      }

      log(`Parsed ${batch.testCases.length} test case(s) from "${batch.batchName}"`);
      const stepCounts = batch.testCases.map((tc) => tc.steps?.length ?? 0);
      logger.info('Parsing complete', {
        jobId: job.jobId,
        batchName: batch.batchName,
        totalTestCases: batch.testCases.length,
        steps: {
          min: stepCounts.length > 0 ? Math.min(...stepCounts) : 0,
          max: stepCounts.length > 0 ? Math.max(...stepCounts) : 0,
          total: stepCounts.reduce((sum, n) => sum + n, 0),
        },
      });

      // ── Feature partitioning metadata ─────────────────────────────────────
      const partitions = this.partitioner.partition(batch.testCases);
      for (const partition of partitions) {
        for (const testCase of partition.testCases) {
          testCase.feature = partition.featureName;
        }
      }
      const partitionSummary = partitions.map((p) => `${p.featureName}(${p.testCases.length})`).join(', ');
      log(`Feature partitions: ${partitionSummary}`);
      logger.info('Feature partitions detected', {
        jobId: job.jobId,
        partitions: partitions.map((p) => ({ feature: p.featureName, count: p.testCases.length })),
      });

      // ── Demo/cost guard: enforce effective per-job test-case cap ─────────
      const effectiveLimit = opts?.effectiveMaxTestCases ?? runtimeConfig.MAX_TEST_CASES_PER_JOB;
      if (batch.testCases.length > effectiveLimit) {
        logger.warn('Test case limit exceeded', {
          jobId: job.jobId,
          received: batch.testCases.length,
          allowed: effectiveLimit,
          hardLimit: runtimeConfig.MAX_TEST_CASES_HARD_LIMIT,
        });
        throw new Error(
          `This job contains ${batch.testCases.length} test case(s), which exceeds the ` +
          `per-job limit of ${effectiveLimit}. ` +
          `Increase the job limit up to ${runtimeConfig.MAX_TEST_CASES_HARD_LIMIT} or upload a smaller file.`,
        );
      }

      job.totalCases = batch.testCases.length;
      job.processedCases = 0;
      jobStore.set(job);

      // ── Split ─────────────────────────────────────────────────────────────
      const splitsDir = path.join(JOBS_BASE_DIR, job.jobId, 'splits');
      const splitter = new TestCaseSplitter();
      const splits = splitter.split(batch, splitsDir);
      log(`Split into ${splits.length} child job file(s)`);
      logger.info('Batch split into child jobs', { jobId: job.jobId, childCount: splits.length });

      // ── Execute generation in parallel ────────────────────────────────────
      const totalCases = batch.testCases.length;
      const allocationMode = job.allocationMode ?? 'manual';
      const scaling = runtimeResourceService.resolveEffectiveAgents(
        totalCases,
        allocationMode,
        job.parallelAgents,
      );
      const effectiveParallelAgents = scaling.effectiveAgents;
      const { distribution } = scaling;

      if (scaling.reducedReason) {
        log(scaling.reducedReason);
        logger.warn(scaling.reducedReason, { jobId: job.jobId });
      }

      log(`[AgentScaling] totalTestCases=${totalCases}`);
      log(`[AgentScaling] allocationMode=${allocationMode}`);
      log(`[AgentScaling] requestedAgents=${job.parallelAgents}`);
      log(`[AgentScaling] workloadBasedAgents=${scaling.workloadBasedAgents}`);
      log(`[AgentScaling] cpuBasedAgents=${scaling.cpuBasedAgents}`);
      log(`[AgentScaling] memoryBasedAgents=${scaling.memoryBasedAgents}`);
      log(`[AgentScaling] effectiveAgents=${effectiveParallelAgents}`);
      log(`[AgentScaling] distribution=${distribution.join(',')}`);
      log(`Generating with ${effectiveParallelAgents} parallel agent(s)…`);
      logger.info('Starting batch generation', {
        jobId: job.jobId,
        totalTestCases: totalCases,
        allocationMode,
        requestedParallelAgents: job.parallelAgents,
        effectiveParallelAgents,
        distribution,
      });

      // ── Playwright browser pre-flight (only needed for generate-and-execute) ─
      if (job.executionMode === 'generate-and-execute' && !playwrightReady()) {
        const isDocker = process.env.PLAYWRIGHT_BROWSERS_PATH === '/ms-playwright'
          || process.env.IN_DOCKER === 'true'
          || fs.existsSync('/.dockerenv');
        const fixMsg = isDocker
          ? 'When running with Docker, rebuild the API image using the official Playwright image.'
          : 'Run: npx playwright install --with-deps chromium';
        throw new Error(
          `Error category: PLAYWRIGHT_RUNTIME_MISSING_DEPS. ` +
          `Chromium browser is not available on this server. ${fixMsg}`,
        );
      }

      const childResults = await this.pool.runAll(job, splits, effectiveParallelAgents, aiConfig);

      const failedChildren = childResults.filter((r) => r.exitCode !== 0);
      if (failedChildren.length > 0) {
        const summary = failedChildren
          .map((r) => `${r.childId}: exit ${r.exitCode}`)
          .join(', ');
        logger.error('Child agent(s) failed', {
          jobId: job.jobId,
          failedCount: failedChildren.length,
          summary,
        });
        throw new Error(
          `Generation failed for ${failedChildren.length} child job(s): ${summary}. Check the job logs for details.`,
        );
      }

      // ── Merge into single project ─────────────────────────────────────────
      log('Merging generated artifacts into final-project…');
      const childIds = splits.map((s) => s.childId);
      const finalDir = this.merger.merge(job, childIds);
      this.merger.validate(finalDir);
      job.artifactsPath = finalDir;
      log(`Final project: ${finalDir}`);

      // ── Optionally run tests ───────────────────────────────────────────────
      let testRunExitCode = 0;
      let testRunStdout: string | undefined;
      let failureAnalysis: FailureAnalysis | undefined;
      let allureStatus = {
        configured: true,
        resultsGenerated: false,
        reportGenerated: false,
      };
      if (job.executionMode === 'generate-and-execute') {
        log('Execution mode: Generate + Execute — running Playwright tests…');

        // Create node_modules symlink so generated specs can resolve @playwright/test
        // and allure-playwright without a full npm install in the generated project.
        const playwrightSymlinkCreated =
          !runtimeConfig.INSTALL_GENERATED_PROJECT_DEPS && createNodeModulesLink(finalDir);
        try {
          const testResult = await this.runPlaywright(finalDir, log);
          testRunExitCode = testResult.exitCode;
          testRunStdout = testResult.stdout;
          if (testRunExitCode !== 0) {
            failureAnalysis = await this.analyzeFailure(testResult.stderr, testResult.stdout, aiConfig, log);
          }
          log(`Playwright exit code: ${testRunExitCode}`);
        } finally {
          if (playwrightSymlinkCreated) removeNodeModulesLink(finalDir);
        }

        // ── Allure report generation (non-blocking) ────────────────────────
        const allureSymlinkCreated =
          !runtimeConfig.INSTALL_GENERATED_PROJECT_DEPS && createNodeModulesLink(finalDir);
        try {
          allureStatus = await this.generateAllureReport(finalDir, log);
        } finally {
          if (allureSymlinkCreated) removeNodeModulesLink(finalDir);
        }
      }

      // Ensure no stale symlink ends up in the ZIP (defensive cleanup).
      removeNodeModulesLink(finalDir);

      // ── Report ────────────────────────────────────────────────────────────
      const aiUsage = this.buildAiUsageSummary(aiConfig, childResults, failureAnalysis !== undefined);

      const report = this.reporter.build({
        startedAt,
        childResults,
        parallelAgents: effectiveParallelAgents,
        executionMode: job.executionMode,
        testRunExitCode,
        testRunStdout,
        allure: allureStatus,
        aiUsage,
        failureAnalysis,
      });
      job.report = report;

      const reportPath = path.join(JOBS_BASE_DIR, job.jobId, 'report.json');
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      fs.mkdirSync(path.join(finalDir, 'reports'), { recursive: true });
      fs.writeFileSync(
        path.join(finalDir, 'reports', 'batch-execution-report.json'),
        JSON.stringify(report, null, 2),
      );

      this.merger.validateZipReadiness(finalDir, {
        executionMode: job.executionMode,
        report,
      });

      job.setStatus(report.status === 'failed' ? 'failed' : 'completed');
      log(`Job finished — ${report.status.toUpperCase()} (${report.passed}/${report.totalCases} passed)`);
      logger.info('Job completed', {
        jobId: job.jobId,
        status: report.status,
        passed: report.passed,
        totalCases: report.totalCases,
        durationMs: report.durationMs,
      });
      jobStore.set(job);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      job.setStatus('failed');
      job.error = msg;
      job.report = {
        status: 'failed',
        executionMode: job.executionMode,
        generation: {
          total: job.totalCases ?? 0,
          passed: 0,
          failed: job.totalCases ?? 0,
        },
        execution: {
          enabled: job.executionMode === 'generate-and-execute',
          total: 0,
          passed: 0,
          failed: 0,
          exitCode: 1,
        },
        allure: {
          configured: true,
          resultsGenerated: false,
          reportGenerated: false,
        },
        totalCases: job.totalCases ?? 0,
        passed: 0,
        failed: job.totalCases ?? 0,
        durationMs: Date.now() - startedAt,
        parallelAgents: job.parallelAgents,
        summary: `Job failed: ${msg}`,
      };
      log(`ERROR: ${msg}`);
      logger.error('Job failed', {
        jobId: job.jobId,
        error: msg,
        durationMs: Date.now() - startedAt,
      });
      const reportPath = path.join(JOBS_BASE_DIR, job.jobId, 'report.json');
      fs.writeFileSync(reportPath, JSON.stringify(job.report, null, 2));
      jobStore.set(job);
    }
  }

  /**
   * Attempts to generate an Allure HTML report from the allure-results directory.
   *
   * When INSTALL_GENERATED_PROJECT_DEPS=false, the platform's pre-installed allure
   * CLI binary is used (resolved from REPO_ROOT_DIR or PLATFORM_BASE_DIR node_modules)
   * so that the generated project does not need its own `npm install`.
   *
   * When INSTALL_GENERATED_PROJECT_DEPS=true, `npx allure` is used inside the
   * generated project directory which has its own allure-commandline installed.
   *
   * This step is non-blocking: if Allure is unavailable or the command fails, a
   * warning is logged and the job continues normally.
   *
   * @param projectDir - Absolute path to the final project directory.
   * @param log - Log function that writes timestamped entries to the job log.
   */
  private generateAllureReport(
    projectDir: string,
    log: (msg: string) => void,
  ): Promise<{ configured: boolean; resultsGenerated: boolean; reportGenerated: boolean }> {
    const allureResultsDir = path.join(projectDir, 'allure-results');
    if (!fs.existsSync(allureResultsDir)) {
      log('[Allure] allure-results directory not found — skipping Allure HTML generation');
      return Promise.resolve({
        configured: true,
        resultsGenerated: false,
        reportGenerated: false,
      });
    }

    // Resolve the allure binary. Prefer the platform's pre-installed binary so we
    // do not depend on npx fetching it at runtime when INSTALL_GENERATED_PROJECT_DEPS=false.
    let allureBin: string;
    let allureArgs: string[];
    if (!runtimeConfig.INSTALL_GENERATED_PROJECT_DEPS) {
      // Check platform monorepo node_modules first, then repo-root node_modules.
      const platformBin = path.join(PLATFORM_BASE_DIR, 'node_modules', '.bin', 'allure');
      const rootBin = path.join(REPO_ROOT_DIR, 'node_modules', '.bin', 'allure');
      if (fs.existsSync(platformBin)) {
        allureBin = platformBin;
      } else if (fs.existsSync(rootBin)) {
        allureBin = rootBin;
      } else {
        log('[Allure] WARNING: platform allure binary not found — skipping Allure HTML generation');
        logger.warn('[Allure] Platform allure binary not found (non-blocking)', { platformBin, rootBin });
        return Promise.resolve({
          configured: true,
          resultsGenerated: true,
          reportGenerated: false,
        });
      }
      allureArgs = ['generate', 'allure-results', '--clean', '-o', 'allure-report'];
    } else {
      allureBin = 'npx';
      allureArgs = ['allure', 'generate', 'allure-results', '--clean', '-o', 'allure-report'];
    }

    return new Promise<{ configured: boolean; resultsGenerated: boolean; reportGenerated: boolean }>((resolve) => {
      log('[Allure] Generating Allure HTML report…');
      const allureChild = spawn(
        allureBin,
        allureArgs,
        {
          cwd: projectDir,
          shell: false,
          env: { ...process.env },
        },
      );

      allureChild.stdout.on('data', (data: Buffer) => {
        data.toString().split('\n').filter(Boolean).forEach((l) => log(`[Allure] ${l}`));
      });

      allureChild.stderr.on('data', (data: Buffer) => {
        data.toString().split('\n').filter(Boolean).forEach((l) => log(`[Allure STDERR] ${l}`));
      });

      allureChild.on('close', (code) => {
        if (code === 0) {
          log('[Allure] HTML report generated at allure-report/');
          logger.info('Allure report generated', { projectDir });
          resolve({
            configured: true,
            resultsGenerated: true,
            reportGenerated: true,
          });
        } else {
          log(`[Allure] WARNING: Allure HTML generation exited with code ${code ?? '?'} — continuing without HTML report`);
          logger.warn('Allure HTML generation failed (non-blocking)', { projectDir, exitCode: code });
          resolve({
            configured: true,
            resultsGenerated: true,
            reportGenerated: false,
          });
        }
      });

      allureChild.on('error', (err) => {
        log(`[Allure] WARNING: Allure command unavailable (${err.message}) — continuing without HTML report`);
        logger.warn('Allure command unavailable (non-blocking)', { projectDir, error: err.message });
        resolve({
          configured: true,
          resultsGenerated: true,
          reportGenerated: false,
        });
      });
    });
  }

  /**
   * Runs the generated Playwright tests inside the final merged project directory.
   *
   * When INSTALL_GENERATED_PROJECT_DEPS=false (default), tests are executed using
   * the platform's pre-installed Playwright binary from the repo root, with the
   * generated project's playwright.config.ts supplied via --config.
   *
   * When INSTALL_GENERATED_PROJECT_DEPS=true, dependencies are installed inside
   * the generated project first, then `npm test` is run from that directory.
   *
   * @param projectDir - Absolute path to the merged final project directory.
   * @param log - Log function that writes timestamped entries to the job log.
   * @returns Exit code, stdout, and stderr from the Playwright test run.
   */
  private runPlaywright(
    projectDir: string,
    log: (msg: string) => void,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve) => {
      let stdout = '';
      let stderr = '';
      if (!runtimeConfig.INSTALL_GENERATED_PROJECT_DEPS) {
        log('Skipping npm install in generated project (INSTALL_GENERATED_PROJECT_DEPS=false)');
        log('Running tests via platform Playwright runtime…');
        const configPath = path.join(projectDir, 'playwright.config.ts');
        const playwrightBin = path.join(REPO_ROOT_DIR, 'node_modules', '.bin', 'playwright');
        const testChild = spawn(playwrightBin, ['test', '--config', configPath], {
          cwd: REPO_ROOT_DIR,
          shell: false,
          env: {
            ...process.env,
            PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
            PLAYWRIGHT_BROWSERS_PATH: runtimeConfig.PLAYWRIGHT_BROWSERS_PATH,
            // Direct allure-playwright to write results into the generated project dir
            // so they are included in the ZIP and the Allure HTML generation step finds them.
            ALLURE_RESULTS_DIR: path.join(projectDir, 'allure-results'),
          },
        });

        testChild.stdout.on('data', (data: Buffer) => {
          const text = data.toString();
          stdout += text;
          text.split('\n').filter(Boolean).forEach(log);
        });

        testChild.stderr.on('data', (data: Buffer) => {
          const text = data.toString();
          stderr += text;
          text
            .split('\n')
            .filter(Boolean)
            .forEach((l) => log(`[TEST STDERR] ${l}`));
        });

        testChild.on('close', (testCode) => resolve({ exitCode: testCode ?? 1, stdout, stderr }));
        testChild.on('error', () => resolve({ exitCode: 1, stdout, stderr }));
        return;
      }

      const installAndRunTests = (): void => {
        const testChild = spawn('npm', ['test'], {
          cwd: projectDir,
          shell: false,
          env: {
            ...process.env,
            PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
            PLAYWRIGHT_BROWSERS_PATH: runtimeConfig.PLAYWRIGHT_BROWSERS_PATH,
          },
        });

        testChild.stdout.on('data', (data: Buffer) => {
          const text = data.toString();
          stdout += text;
          text.split('\n').filter(Boolean).forEach(log);
        });

        testChild.stderr.on('data', (data: Buffer) => {
          const text = data.toString();
          stderr += text;
          text
            .split('\n')
            .filter(Boolean)
            .forEach((l) => log(`[TEST STDERR] ${l}`));
        });

        testChild.on('close', (testCode) => resolve({ exitCode: testCode ?? 1, stdout, stderr }));
        testChild.on('error', () => resolve({ exitCode: 1, stdout, stderr }));
      };

      const child = spawn('npm', ['install'], {
        cwd: projectDir,
        shell: false,
        env: {
          ...process.env,
          PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
          PLAYWRIGHT_BROWSERS_PATH: runtimeConfig.PLAYWRIGHT_BROWSERS_PATH,
        },
      });

      child.stdout.on('data', (data: Buffer) => {
        data.toString().split('\n').filter(Boolean).forEach((line) => log(`[INSTALL] ${line}`));
      });

      child.stderr.on('data', (data: Buffer) => {
        data
          .toString()
          .split('\n')
          .filter(Boolean)
          .forEach((l) => log(`[INSTALL STDERR] ${l}`));
      });

      child.on('close', (code) => {
        if ((code ?? 1) !== 0) {
          resolve({ exitCode: code ?? 1, stdout, stderr });
          return;
        }
        installAndRunTests();
      });
      child.on('error', () => resolve({ exitCode: 1, stdout, stderr }));
    });
  }

  /**
   * Uses the configured AI provider to analyze Playwright test failure output.
   *
   * Called only when executionMode is 'generate-and-execute' and tests fail.
   * Sanitizes log output before sending it to the AI provider to avoid leaking secrets.
   * Returns undefined if AI is not configured for failure analysis or if the call fails.
   *
   * @param stderr - Standard error output from the Playwright test run.
   * @param stdout - Standard output from the Playwright test run.
   * @param aiConfig - AI provider configuration.
   * @param log - Log function for writing analysis status messages.
   * @returns Structured failure analysis, or undefined if unavailable.
   */
  private async analyzeFailure(
    stderr: string,
    stdout: string,
    aiConfig: AiConfig | undefined,
    log: (msg: string) => void,
  ): Promise<FailureAnalysis | undefined> {
    if (!aiConfig?.usedFor?.failureAnalysis || aiConfig.provider === 'none') {
      return undefined;
    }

    try {
      const provider = AiProviderFactory.create(aiConfig);
      const response = await provider.complete({
        prompt: this.aiPromptService.buildFailureAnalysisPrompt(
          this.sanitizeLogs(stderr),
          this.sanitizeLogs(stdout),
        ),
        maxTokens: 256,
      });
      const parsed = JSON.parse(this.extractJsonObject(response.text)) as FailureAnalysis;
      if (!parsed.category || !parsed.summary || !parsed.suggestedFix) {
        return undefined;
      }
      log(`AI failure analysis: ${parsed.category} — ${parsed.summary}`);
      return parsed;
    } catch (error) {
      const warning = error instanceof Error ? error.message : String(error);
      log(`AI failure analysis unavailable: ${warning}`);
      return {
        category: 'ai-unavailable',
        summary: 'AI failure analysis was unavailable; inspect the generated test logs.',
        suggestedFix: 'Review the generated test stdout/stderr and retry when the configured AI provider is reachable.',
        warning,
      };
    }
  }

  /**
   * Aggregates AI usage statistics from all child job results into a single summary.
   *
   * Combines call counts (parsing, naming, failure analysis) across all children.
   * Adds one failure analysis call if the batch-level failure analysis was also invoked.
   *
   * @param aiConfig - The AI configuration used for this job (for provider/model defaults).
   * @param childResults - Results from each child agent, each optionally containing AI usage.
   * @param usedFailureAnalysis - Whether the batch-level failure analysis call was made.
   * @returns Aggregated AI usage summary for the full job.
   */
  private buildAiUsageSummary(
    aiConfig: AiConfig | undefined,
    childResults: Array<{ aiUsage?: AiUsageSummary }>,
    usedFailureAnalysis = false,
  ): AiUsageSummary {
    const childUsage = childResults
      .map((result) => result.aiUsage)
      .filter((usage): usage is AiUsageSummary => Boolean(usage));

    return {
      provider: childUsage[0]?.provider ?? aiConfig?.provider ?? 'none',
      model: childUsage[0]?.model ?? aiConfig?.model,
      calls: childUsage.reduce((sum, usage) => sum + usage.calls, 0) + (usedFailureAnalysis ? 1 : 0),
      parsingCalls: childUsage.reduce((sum, usage) => sum + usage.parsingCalls, 0),
      namingCalls: childUsage.reduce((sum, usage) => sum + usage.namingCalls, 0),
      failureAnalysisCalls: childUsage.reduce((sum, usage) => sum + usage.failureAnalysisCalls, 0) + (usedFailureAnalysis ? 1 : 0),
    };
  }

  private sanitizeLogs(text: string): string {
    return text
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
      .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED_API_KEY]')
      .replace(/AIza[A-Za-z0-9_-]+/g, '[REDACTED_API_KEY]')
      .replace(/(OPENAI_API_KEY|GEMINI_API_KEY|AZURE_OPENAI_API_KEY)\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/gi, '$1=[REDACTED]')
      .replace(/api[_-]?key["'=:\s]+[A-Za-z0-9._-]+/gi, 'apiKey=[REDACTED]')
      .replace(/[A-Za-z0-9._%+-]+:[^@\s]+@/g, '[REDACTED_CREDENTIALS]@')
      .slice(0, 4000);
  }

  private extractJsonObject(text: string): string {
    const trimmed = text.trim();
    if (trimmed.startsWith('{')) {
      return trimmed;
    }
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error('AI response did not contain JSON');
    }
    return match[0];
  }
}

export const batchJobManager = new BatchJobManager();
