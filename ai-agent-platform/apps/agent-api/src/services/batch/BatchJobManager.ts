import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import type { AiConfig, AiUsageSummary } from '@ai-agent/shared-types';
import { TestCaseParserFactory, TestCaseBatchValidator, TestCaseSplitter } from '@ai-agent/agent-core';
import { JOBS_BASE_DIR } from '../../config';
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
      job.totalCases = batch.testCases.length;
      job.processedCases = 0;
      jobStore.set(job);

      // ── Playwright browser pre-flight ─────────────────────────────────────
      if (!playwrightReady()) {
        throw new Error(
          '[PLAYWRIGHT_RUNTIME_MISSING_DEPS] Chromium browser is not available on this server. ' +
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
      if (job.executionMode === 'generate-and-execute') {
        log('Execution mode: Generate + Execute — running Playwright tests…');
        testRunExitCode = await this.runPlaywright(finalDir, log);
        log(`Playwright exit code: ${testRunExitCode}`);
      }

      // ── Report ────────────────────────────────────────────────────────────
      const aiUsage = this.buildAiUsageSummary(aiConfig, childResults);

      const report = this.reporter.build({
        startedAt,
        childResults,
        parallelAgents: effectiveParallelAgents,
        executionMode: job.executionMode,
        testRunExitCode,
        aiUsage,
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

  /** Installs generated-project deps and then runs `npm test`, returning the final exit code. */
  private runPlaywright(projectDir: string, log: (msg: string) => void): Promise<number> {
    return new Promise<number>((resolve) => {
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
          data.toString().split('\n').filter(Boolean).forEach(log);
        });

        testChild.stderr.on('data', (data: Buffer) => {
          data
            .toString()
            .split('\n')
            .filter(Boolean)
            .forEach((l) => log(`[TEST STDERR] ${l}`));
        });

        testChild.on('close', (testCode) => resolve(testCode ?? 1));
        testChild.on('error', () => resolve(1));
      };

      if (!runtimeConfig.INSTALL_GENERATED_PROJECT_DEPS) {
        log('Skipping npm install in generated project (INSTALL_GENERATED_PROJECT_DEPS=false)');
        installAndRunTests();
        return;
      }

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
          resolve(code ?? 1);
          return;
        }
        installAndRunTests();
      });
      child.on('error', () => resolve(1));
    });
  }

  private buildAiUsageSummary(aiConfig: AiConfig | undefined, childResults: Array<{ aiUsage?: AiUsageSummary }>): AiUsageSummary {
    const childUsage = childResults
      .map((result) => result.aiUsage)
      .filter((usage): usage is AiUsageSummary => Boolean(usage));

    return {
      provider: childUsage[0]?.provider ?? aiConfig?.provider ?? 'none',
      model: childUsage[0]?.model ?? aiConfig?.model,
      calls: childUsage.reduce((sum, usage) => sum + usage.calls, 0),
      parsingCalls: childUsage.reduce((sum, usage) => sum + usage.parsingCalls, 0),
      namingCalls: childUsage.reduce((sum, usage) => sum + usage.namingCalls, 0),
      failureAnalysisCalls: childUsage.reduce((sum, usage) => sum + usage.failureAnalysisCalls, 0),
    };
  }
}

export const batchJobManager = new BatchJobManager();
