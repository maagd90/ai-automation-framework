import type { Job, JobStatus, BatchReport, ExecutionMode } from '@ai-agent/shared-types';

export class JobEntity implements Job {
  jobId: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  inputFile: string;
  url: string;
  framework: string;
  executionMode: ExecutionMode;
  headless: boolean;
  parallelAgents: number;
  retryCount: number;
  screenshotOnFailure: boolean;
  traceOnFailure: boolean;
  videoOnFailure: boolean;
  totalCases?: number;
  processedCases?: number;
  logs: string[];
  artifactsPath?: string;
  report?: BatchReport;
  error?: string;

  constructor(params: {
    jobId: string;
    inputFile: string;
    url: string;
    framework: string;
    executionMode?: ExecutionMode;
    headless?: boolean;
    parallelAgents?: number;
    retryCount?: number;
    screenshotOnFailure?: boolean;
    traceOnFailure?: boolean;
    videoOnFailure?: boolean;
  }) {
    this.jobId = params.jobId;
    this.status = 'pending';
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    this.inputFile = params.inputFile;
    this.url = params.url;
    this.framework = params.framework;
    this.executionMode = params.executionMode ?? 'generate-only';
    this.headless = params.headless ?? true;
    this.parallelAgents = params.parallelAgents ?? 1;
    this.retryCount = params.retryCount ?? 0;
    this.screenshotOnFailure = params.screenshotOnFailure ?? true;
    this.traceOnFailure = params.traceOnFailure ?? false;
    this.videoOnFailure = params.videoOnFailure ?? false;
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

  incrementProcessed(): void {
    this.processedCases = (this.processedCases ?? 0) + 1;
    this.updatedAt = new Date().toISOString();
  }
}
