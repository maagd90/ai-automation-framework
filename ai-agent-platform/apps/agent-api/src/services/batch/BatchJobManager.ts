import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import type { AiConfig, AiUsageSummary, FailureAnalysis } from '@ai-agent/shared-types';
import { AiPromptService, AiProviderFactory, TestCaseParserFactory, TestCaseBatchValidator, TestCaseSplitter } from '@ai-agent/agent-core';
import { JOBS_BASE_DIR, REPO_ROOT_DIR } from '../../config';
import { runtimeConfig } from '../../config/runtime.config';
import { JobEntity } from '../../domain/Job';
import { jobStore } from '../JobStore';
import { playwrightReady } from '../PlaywrightReadinessCheck';
import { AgentPoolManager } from './AgentPoolManager';
import { ProjectMerger } from './ProjectMerger';
import { BatchReportService } from './BatchReportService';

export class BatchJobManager {
  private readonly pool = new AgentPoolManager();
  private readonly merger = new ProjectMerger();
  private readonly reporter = new BatchReportService();
  private readonly aiPromptService = new AiPromptService();

  async run(job: JobEntity, aiConfig?: AiConfig): Promise<void> {
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

      // ── Parse ─────────────────────────────────────────────────────────────
      log('Parsing test case file…');
      const content = fs.readFileSync(job.inputFile, 'utf8');
      const parser = new TestCaseParserFactory();
      const batch = parser.parse(job.inputFile, content);

      // ── Validate ──────────────────────────────────────────────────────────
      const validator = new TestCaseBatchValidator();
      const validation = validator.validate(batch);
      if (!validation.valid) {
        const msg = validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ');
        throw new Error(`Batch validation failed: ${msg}`);
      }

      log(`Parsed ${batch.testCases.length} test case(s) from "${batch.batchName}"`);

      // ── Demo/cost guard: enforce per-job test-case cap ────────────────────
      if (batch.testCases.length > runtimeConfig.MAX_TEST_CASES_PER_JOB) {
        throw new Error(
          `This job contains ${batch.testCases.length} test case(s), which exceeds the ` +
          `per-job limit of ${runtimeConfig.MAX_TEST_CASES_PER_JOB}. ` +
          `Split the file into smaller batches or increase MAX_TEST_CASES_PER_JOB.`,
        );
      }

      job.totalCases = batch.testCases.length;
      job.processedCases = 0;
      jobStore.set(job);

      // ── Playwright browser pre-flight ─────────────────────────────────────
      if (!playwrightReady()) {
        throw new Error(
          'Error category: PLAYWRIGHT_RUNTIME_MISSING_DEPS. Chromium browser is not available on this server. ' +
          'Run: npx playwright install --with-deps chromium',
        );
      }

      // ── Split ─────────────────────────────────────────────────────────────
      const splitsDir = path.join(JOBS_BASE_DIR, job.jobId, 'splits');
      const splitter = new TestCaseSplitter();
      const splits = splitter.split(batch, splitsDir);
      log(`Split into ${splits.length} child job file(s)`);

      // ── Execute generation in parallel ────────────────────────────────────
      const effectiveParallelAgents = Math.min(
        job.parallelAgents,
        runtimeConfig.MAX_PARALLEL_AGENTS_PER_JOB,
      );
      log(`Requested parallel agents: ${job.parallelAgents}`);
      log(`Effective parallel agents (capped): ${effectiveParallelAgents}`);
      log(`Generating with ${effectiveParallelAgents} parallel agent(s)…`);
      const childResults = await this.pool.runAll(job, splits, effectiveParallelAgents, aiConfig);

      const failedChildren = childResults.filter((r) => r.exitCode !== 0);
      if (failedChildren.length > 0) {
        const summary = failedChildren
          .map((r) => `${r.childId}: exit ${r.exitCode}`)
          .join(', ');
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
      let failureAnalysis: FailureAnalysis | undefined;
      if (job.executionMode === 'generate-and-execute') {
        log('Execution mode: Generate + Execute — running Playwright tests…');
        const testResult = await this.runPlaywright(finalDir, log);
        testRunExitCode = testResult.exitCode;
        if (testRunExitCode !== 0) {
          failureAnalysis = await this.analyzeFailure(testResult.stderr, testResult.stdout, aiConfig, log);
        }
        log(`Playwright exit code: ${testRunExitCode}`);
      }

      // ── Report ────────────────────────────────────────────────────────────
      const aiUsage = this.buildAiUsageSummary(aiConfig, childResults, failureAnalysis !== undefined);

      const report = this.reporter.build({
        startedAt,
        childResults,
        parallelAgents: effectiveParallelAgents,
        executionMode: job.executionMode,
        testRunExitCode,
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

      job.setStatus(report.status === 'failed' ? 'failed' : 'completed');
      log(`Job finished — ${report.status.toUpperCase()} (${report.passed}/${report.totalCases} passed)`);
      jobStore.set(job);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      job.setStatus('failed');
      job.error = msg;
      job.report = {
        status: 'failed',
        totalCases: job.totalCases ?? 0,
        passed: 0,
        failed: job.totalCases ?? 0,
        durationMs: Date.now() - startedAt,
        parallelAgents: job.parallelAgents,
        summary: `Job failed: ${msg}`,
      };
      log(`ERROR: ${msg}`);
      const reportPath = path.join(JOBS_BASE_DIR, job.jobId, 'report.json');
      fs.writeFileSync(reportPath, JSON.stringify(job.report, null, 2));
      jobStore.set(job);
    }
  }

  /** Runs Playwright tests, returning the final exit code.
   *
   * When INSTALL_GENERATED_PROJECT_DEPS=false, tests are executed from the repo
   * root (where @playwright/test is already installed) using the generated
   * project's playwright.config.ts so Playwright resolves testDir correctly.
   *
   * When INSTALL_GENERATED_PROJECT_DEPS=true, deps are installed inside the
   * generated project first and `npm test` is run from there.
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
