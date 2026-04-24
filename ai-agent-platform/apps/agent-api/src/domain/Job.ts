import type { Job, JobStatus, ExecutionReport } from '@ai-agent/shared-types';

export class JobEntity implements Job {
  jobId: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  inputFile: string;
  url: string;
  framework: string;
  headless: boolean;
  logs: string[];
  artifactsPath?: string;
  report?: ExecutionReport;
  error?: string;

  constructor(params: {
    jobId: string;
    inputFile: string;
    url: string;
    framework: string;
    headless: boolean;
  }) {
    this.jobId = params.jobId;
    this.status = 'pending';
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    this.inputFile = params.inputFile;
    this.url = params.url;
    this.framework = params.framework;
    this.headless = params.headless;
    this.logs = [];
  }

  addLog(line: string): void {
    this.logs.push(line);
    this.updatedAt = new Date().toISOString();
  }

  setStatus(status: JobStatus): void {
    this.status = status;
    this.updatedAt = new Date().toISOString();
  }
}
