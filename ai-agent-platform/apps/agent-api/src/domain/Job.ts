import type { Job, JobStatus, BatchReport, ExecutionMode, AllocationMode } from '@ai-agent/shared-types';

export class JobEntity implements Job {
  jobId: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  inputFile: string;
  url: string;
  framework: string;
  executionMode: ExecutionMode;
  allocationMode: AllocationMode;
  headless: boolean;
  parallelAgents: number;
  retryCount: number;
  screenshotOnFailure: boolean;
  traceOnFailure: boolean;
  videoOnFailure: boolean;
  enableWebwright: boolean;
  totalCases?: number;
  processedCases?: number;
  logs: string[];
  artifactsPath?: string;
  report?: BatchReport;
  error?: string;
  /** Set to true after the generated artifacts ZIP has been downloaded and cleaned up. */
  artifactsDownloaded?: boolean;

  constructor(params: {
    jobId: string;
    inputFile: string;
    url: string;
    framework: string;
    executionMode?: ExecutionMode;
    allocationMode?: AllocationMode;
    headless?: boolean;
    parallelAgents?: number;
    retryCount?: number;
    screenshotOnFailure?: boolean;
    traceOnFailure?: boolean;
    videoOnFailure?: boolean;
    enableWebwright?: boolean;
  }) {
    this.jobId = params.jobId;
    this.status = 'pending';
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    this.inputFile = params.inputFile;
    this.url = params.url;
    this.framework = params.framework;
    this.executionMode = params.executionMode ?? 'generate-only';
    this.allocationMode = params.allocationMode ?? 'auto';
    this.headless = params.headless ?? true;
    this.parallelAgents = params.parallelAgents ?? 2;
    this.retryCount = params.retryCount ?? 0;
    this.screenshotOnFailure = params.screenshotOnFailure ?? true;
    this.traceOnFailure = params.traceOnFailure ?? false;
    this.videoOnFailure = params.videoOnFailure ?? false;
    this.enableWebwright = params.enableWebwright ?? false;
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

  markDownloaded(): void {
    this.artifactsDownloaded = true;
    this.artifactsPath = undefined;
    this.updatedAt = new Date().toISOString();
  }
}
