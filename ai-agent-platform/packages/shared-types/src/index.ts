// ── Canonical test-case model ──────────────────────────────────────────────

export interface TestStep {
  order: number;
  action: string;
  target?: string;
  value?: string;
}

export interface TestCase {
  id: string;
  name: string;
  description?: string;
  steps: TestStep[];
}

export interface TestCaseBatch {
  batchName: string;
  testCases: TestCase[];
}

// ── Execution & AI configuration ───────────────────────────────────────────

export interface ExecutionConfig {
  framework: string;
  headless: boolean;
  parallelAgents: number;
  retryCount: number;
  captureEvidence: boolean;
}

export type AiProvider = 'openai' | 'gemini' | 'azure' | 'local' | 'none';

export interface AiConfig {
  provider: AiProvider;
  /** Never stored/logged — consumed server-side only */
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  usedFor?: {
    locatorSuggestion?: boolean;
    testSummary?: boolean;
  };
}

// ── Batch execution report ─────────────────────────────────────────────────

export type BatchStatus = 'passed' | 'failed' | 'partial';

export interface BatchReport {
  status: BatchStatus;
  totalCases: number;
  passed: number;
  failed: number;
  durationMs: number;
  parallelAgents: number;
  aiUsage?: number;
  summary: string;
}

// ── Job domain ─────────────────────────────────────────────────────────────

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
  parallelAgents: number;
  retryCount: number;
  captureEvidence: boolean;
  totalCases?: number;
  processedCases?: number;
  logs: string[];
  artifactsPath?: string;
  report?: BatchReport;
  error?: string;
}

// ── API contracts ──────────────────────────────────────────────────────────

export interface GenerateRequest {
  url: string;
  framework: string;
  headless: boolean;
}

export interface CreateJobResponse {
  jobId: string;
}

export interface JobStatusResponse {
  jobId: string;
  status: JobStatus;
  totalCases?: number;
  processedCases?: number;
}

export interface JobLogsResponse {
  logs: string[];
}

/** The full batch report is returned directly as the report response. */
export type JobReportResponse = BatchReport;
