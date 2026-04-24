import fs from 'fs';
import path from 'path';
import type { AiConfig } from '@ai-agent/shared-types';
import { TestCaseParserFactory, TestCaseBatchValidator, TestCaseSplitter } from '@ai-agent/agent-core';
import { JOBS_BASE_DIR } from '../../config';
import { JobEntity } from '../../domain/Job';
import { jobStore } from '../JobStore';
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

      // ── Split ─────────────────────────────────────────────────────────────
      const splitsDir = path.join(JOBS_BASE_DIR, job.jobId, 'splits');
      const splitter = new TestCaseSplitter();
      const splits = splitter.split(batch, splitsDir);
      log(`Split into ${splits.length} child job file(s)`);

      // ── Execute ───────────────────────────────────────────────────────────
      log(`Executing with ${job.parallelAgents} parallel agent(s)…`);
      const childResults = await this.pool.runAll(job, splits);

      // ── Merge ─────────────────────────────────────────────────────────────
      log('Merging generated artifacts…');
      const childIds = splits.map((s) => s.childId);
      const finalDir = this.merger.merge(job.jobId, childIds);
      job.artifactsPath = finalDir;

      // ── Report ────────────────────────────────────────────────────────────
      const report = this.reporter.build({
        startedAt,
        childResults,
        parallelAgents: job.parallelAgents,
        aiUsage: aiConfig && aiConfig.provider !== 'none' ? childResults.length : 0,
      });
      job.report = report;

      const reportPath = path.join(JOBS_BASE_DIR, job.jobId, 'report.json');
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

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
}

export const batchJobManager = new BatchJobManager();
