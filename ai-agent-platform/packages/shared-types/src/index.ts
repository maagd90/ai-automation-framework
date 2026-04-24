export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Job {
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
}

export interface ExecutionReport {
  status: 'passed' | 'failed';
  durationMs: number;
  summary: string;
  stdout?: string;
  stderr?: string;
}

export interface GenerateRequest {
  url: string;
  framework: string;
  headless: boolean;
}

export interface JobStatusResponse {
  jobId: string;
  status: JobStatus;
}

export interface JobLogsResponse {
  logs: string[];
}

export interface JobReportResponse {
  status: 'passed' | 'failed';
  durationMs: number;
  summary: string;
}

export interface CreateJobResponse {
  jobId: string;
}
