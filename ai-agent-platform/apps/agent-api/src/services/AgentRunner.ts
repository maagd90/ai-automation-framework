import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { AGENT_CORE_PATH, JOBS_BASE_DIR } from '../config';
import { JobEntity } from '../domain/Job';
import { jobStore } from './JobStore';

export class AgentRunner {
  async run(job: JobEntity): Promise<void> {
    const outputDir = path.join(JOBS_BASE_DIR, job.jobId, 'generated');
    const logsFile = path.join(JOBS_BASE_DIR, job.jobId, 'logs.txt');

    fs.mkdirSync(outputDir, { recursive: true });

    job.setStatus('running');
    job.addLog(`[${new Date().toISOString()}] Job ${job.jobId} started`);
    job.addLog(`[${new Date().toISOString()}] Target URL: ${job.url}`);
    job.addLog(`[${new Date().toISOString()}] Input file: ${job.inputFile}`);
    jobStore.set(job);

    const args = [
      AGENT_CORE_PATH,
      'generate',
      '--file', job.inputFile,
      '--url', job.url,
      '--output', outputDir,
    ];

    await new Promise<void>((resolve, reject) => {
      const child = spawn('node', args, {
        env: {
          ...process.env,
          HEADLESS: String(job.headless),
        },
      });

      const appendLog = (line: string): void => {
        const entry = `[${new Date().toISOString()}] ${line}`;
        job.addLog(entry);
        fs.appendFileSync(logsFile, entry + '\n');
        jobStore.set(job);
      };

      child.stdout.on('data', (data: Buffer) => {
        data.toString().split('\n').filter(Boolean).forEach(appendLog);
      });

      child.stderr.on('data', (data: Buffer) => {
        data.toString().split('\n').filter(Boolean).forEach((l) => appendLog(`[STDERR] ${l}`));
      });

      child.on('close', (code) => {
        if (code === 0) {
          job.setStatus('completed');
          job.artifactsPath = outputDir;
          job.report = {
            status: 'passed',
            totalCases: 1,
            passed: 1,
            failed: 0,
            parallelAgents: job.parallelAgents,
            durationMs: Date.now() - new Date(job.createdAt).getTime(),
            summary: 'Framework generated successfully',
          };
          job.addLog(`[${new Date().toISOString()}] Job completed successfully`);
        } else {
          job.setStatus('failed');
          job.error = `Process exited with code ${code}`;
          job.report = {
            status: 'failed',
            totalCases: 1,
            passed: 0,
            failed: 1,
            parallelAgents: job.parallelAgents,
            durationMs: Date.now() - new Date(job.createdAt).getTime(),
            summary: `Agent exited with code ${code}`,
          };
          job.addLog(`[${new Date().toISOString()}] Job failed with exit code ${code}`);
        }

        const reportPath = path.join(JOBS_BASE_DIR, job.jobId, 'report.json');
        fs.writeFileSync(reportPath, JSON.stringify(job.report, null, 2));
        jobStore.set(job);
        resolve();
      });

      child.on('error', (err) => {
        const msg = `Failed to spawn agent: ${err.message}`;
        job.setStatus('failed');
        job.error = msg;
        job.addLog(`[${new Date().toISOString()}] ERROR: ${msg}`);
        jobStore.set(job);
        reject(err);
      });
    });
  }
}

export const agentRunner = new AgentRunner();
