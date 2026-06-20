import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import type { AiConfig, AiUsageSummary } from '@ai-agent/shared-types';
import { TestCaseParserFactory, TestCaseBatchValidator, TestCaseSplitter } from '@ai-agent/agent-core';
import { JOBS_BASE_DIR } from '../../config';
import { JobEntity } from '../../domain/Job';
import { jobStore } from '../PersistentJobStore';
import { AgentPoolManager } from './AgentPoolManager';
import { ScreenAwareMerger } from './ScreenAwareMerger';
import { MergeValidationService } from './MergeValidationService';
import { BatchReportService } from './BatchReportService';
import { PlaywrightReportParser } from './PlaywrightReportParser';
import { agentScaler } from './AgentScaler';

const INSTALL_TIMEOUT_MS = 300_000;
const TEST_TIMEOUT_MS = 600_000;

export class BatchJobManager {
  private readonly pool = new AgentPoolManager();
  private readonly merger = new ScreenAwareMerger();
  private readonly validator = new MergeValidationService();
  private readonly reporter = new BatchReportService();
  private readonly playwrightParser = new PlaywrightReportParser();

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

      const content = fs.readFileSync(job.inputFile, 'utf8');
      const parser = new TestCaseParserFactory();
      const batch = parser.parse(job.inputFile, content);

      const validation = new TestCaseBatchValidator().validate(batch);
      if (!validation.valid) {
        throw new Error(
          `Batch validation failed: ${validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ')}`,
        );
      }

      const scaledAgents = agentScaler.calculate({
        testCaseCount: batch.testCases.length,
        manualOverride: job.parallelAgents,
        autoScale: job.autoScale !== false,
      });
      job.parallelAgents = scaledAgents;
      log(`Auto-scaled to ${scaledAgents} parallel agent(s) for ${batch.testCases.length} test case(s)`);
      jobStore.set(job);

      job.totalCases = batch.testCases.length;
      job.processedCases = 0;
      jobStore.set(job);

      const splitsDir = path.join(JOBS_BASE_DIR, job.jobId, 'splits');
      const splits = new TestCaseSplitter().split(batch, splitsDir);
      log(`Split into ${splits.length} child job file(s)`);

      log(`Generating with ${job.parallelAgents} parallel agent(s)…`);
      const childResults = await this.pool.runAll(job, splits, aiConfig);

      const failedChildren = childResults.filter((r) => r.exitCode !== 0);
      if (failedChildren.length > 0) {
        throw new Error(
          `Generation failed for ${failedChildren.length} test case(s): ${failedChildren.map((r) => r.testCaseId).join(', ')}`,
        );
      }

      log('Merging with screen-aware deduplication…');
      const finalDir = this.merger.merge(job, splits);
      job.artifactsPath = finalDir;
      log(`Final project: ${finalDir}`);

      log('Running quality gates…');
      log('Installing dependencies for compile check…');
      const installForCheck = await this.runCommand(finalDir, ['npm', 'install'], INSTALL_TIMEOUT_MS, log);
      if (installForCheck !== 0) throw new Error(`npm install failed with exit code ${installForCheck}`);

      const staticValidation = this.validator.validate(finalDir);
      if (!staticValidation.valid) {
        throw new Error(`Quality gate failed: ${staticValidation.errors.join('; ')}`);
      }

      if (job.executionMode === 'generate-and-execute') {
        log('Installing Playwright browsers…');
        const pwInstall = await this.runCommand(
          finalDir,
          ['npx', 'playwright', 'install', 'chromium'],
          INSTALL_TIMEOUT_MS,
          log,
        );
        if (pwInstall !== 0) throw new Error(`playwright install failed with exit code ${pwInstall}`);

        const dryRun = this.validator.dryRunPlaywright(finalDir);
        if (!dryRun.valid) {
          throw new Error(`Playwright dry-run failed: ${dryRun.errors.join('; ')}`);
        }

        log('Running Playwright tests…');
        const testRunExitCode = await this.runCommand(finalDir, ['npm', 'test'], TEST_TIMEOUT_MS, log);
        log(`Playwright exit code: ${testRunExitCode}`);

        const executionResults = this.playwrightParser.parse(
          path.join(finalDir, 'reports', 'playwright-report.json'),
          job.jobId,
        );

        const aiUsage = this.buildAiUsageSummary(aiConfig, childResults);
        job.report = this.reporter.build({
          startedAt,
          childResults,
          parallelAgents: job.parallelAgents,
          executionMode: job.executionMode,
          testRunExitCode,
          aiUsage,
          executionResults,
          batchName: batch.batchName,
        });
      } else {
        const aiUsage = this.buildAiUsageSummary(aiConfig, childResults);
        job.report = this.reporter.build({
          startedAt,
          childResults,
          parallelAgents: job.parallelAgents,
          executionMode: job.executionMode,
          aiUsage,
          batchName: batch.batchName,
        });
      }

      const reportPath = path.join(JOBS_BASE_DIR, job.jobId, 'report.json');
      fs.writeFileSync(reportPath, JSON.stringify(job.report, null, 2));
      fs.mkdirSync(path.join(finalDir, 'reports'), { recursive: true });
      fs.writeFileSync(
        path.join(finalDir, 'reports', 'batch-execution-report.json'),
        JSON.stringify(job.report, null, 2),
      );

      job.setStatus(job.report.status === 'failed' ? 'failed' : 'completed');
      log(`Job finished — ${job.report.status.toUpperCase()} (${job.report.passed}/${job.report.totalCases} passed)`);
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
      fs.writeFileSync(path.join(JOBS_BASE_DIR, job.jobId, 'report.json'), JSON.stringify(job.report, null, 2));
      jobStore.set(job);
    }
  }

  private runCommand(
    cwd: string,
    cmd: string[],
    timeoutMs: number,
    log: (msg: string) => void,
  ): Promise<number> {
    return new Promise<number>((resolve) => {
      const child = spawn(cmd[0], cmd.slice(1), {
        cwd,
        shell: false,
        env: { ...process.env, CI: '1' },
      });

      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        resolve(1);
      }, timeoutMs);

      child.stdout.on('data', (data: Buffer) => {
        data.toString().split('\n').filter(Boolean).forEach((line) => log(line));
      });
      child.stderr.on('data', (data: Buffer) => {
        data.toString().split('\n').filter(Boolean).forEach((l) => log(`[STDERR] ${l}`));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve(code ?? 1);
      });
      child.on('error', () => {
        clearTimeout(timer);
        resolve(1);
      });
    });
  }

  private buildAiUsageSummary(
    aiConfig: AiConfig | undefined,
    childResults: Array<{ aiUsage?: AiUsageSummary }>,
  ): AiUsageSummary {
    const childUsage = childResults
      .map((r) => r.aiUsage)
      .filter((u): u is AiUsageSummary => Boolean(u));
    return {
      provider: childUsage[0]?.provider ?? aiConfig?.provider ?? 'none',
      model: childUsage[0]?.model ?? aiConfig?.model,
      calls: childUsage.reduce((s, u) => s + u.calls, 0),
      parsingCalls: childUsage.reduce((s, u) => s + u.parsingCalls, 0),
      namingCalls: childUsage.reduce((s, u) => s + u.namingCalls, 0),
      failureAnalysisCalls: childUsage.reduce((s, u) => s + u.failureAnalysisCalls, 0),
    };
  }
}

export const batchJobManager = new BatchJobManager();
