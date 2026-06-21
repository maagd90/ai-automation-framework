// ── Canonical test-case model ──────────────────────────────────────────────

export type ActionType =
  | 'enter'
  | 'click'
  | 'select'
  | 'check'
  | 'uncheck'
  | 'verifyText'
  | 'verifyVisible'
  | 'navigate';

export const ACTION_TYPES: readonly ActionType[] = [
  'enter',
  'click',
  'select',
  'check',
  'uncheck',
  'verifyText',
  'verifyVisible',
  'navigate',
] as const;

export type TestPriority = 'high' | 'medium' | 'low';

export interface TestStep {
  order: number;
  action: ActionType | string;
  target?: string;
  value?: string;
  expected?: string;
  /** Original natural-language step text when action was inferred */
  description?: string;
}

export interface TestCase {
  id: string;
  name: string;
  description?: string;
  priority?: TestPriority;
  preconditions?: string[];
  steps: TestStep[];
  expectedResults?: string[];
}

export interface TestCaseBatch {
  batchName: string;
  testCases: TestCase[];
}

// ── Execution & AI configuration ───────────────────────────────────────────

export type ExecutionMode = 'generate-only' | 'generate-and-execute';

export interface ExecutionConfig {
  framework: string;
  executionMode: ExecutionMode;
  headless: boolean;
  parallelAgents: number;
  autoScale?: boolean;
  retryCount: number;
  screenshotOnFailure: boolean;
  traceOnFailure: boolean;
  videoOnFailure: boolean;
}

export type AiProvider = 'openai' | 'gemini' | 'azure' | 'local' | 'none';

export interface AiConfig {
  provider: AiProvider;
  /** Never stored/logged — consumed server-side only */
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  usedFor?: {
    parsing?: boolean;
    naming?: boolean;
    failureAnalysis?: boolean;
  };
}

export interface AiUsageSummary {
  provider: AiProvider;
  model?: string;
  calls: number;
  parsingCalls: number;
  namingCalls: number;
  failureAnalysisCalls: number;
}

// ── Batch execution report ─────────────────────────────────────────────────

export type BatchStatus = 'passed' | 'failed' | 'partial';

export type CaseStatus = 'passed' | 'failed' | 'skipped';

export interface StepResult {
  order: number;
  action: string;
  target?: string;
  status: CaseStatus;
  error?: string;
}

export interface RepairAttempt {
  attempt: number;
  failureType: string;
  suggestion: string;
  patched: boolean;
  filesChanged: string[];
  diff?: string;
}

export interface TestCaseResult {
  id: string;
  name: string;
  priority?: TestPriority;
  generationStatus: CaseStatus;
  executionStatus?: CaseStatus;
  durationMs: number;
  error?: string;
  screenshotUrl?: string;
  traceUrl?: string;
  inputSteps?: TestStep[];
  steps: StepResult[];
  repairAttempts?: RepairAttempt[];
}

export interface BatchReport {
  status: BatchStatus;
  totalCases: number;
  passed: number;
  failed: number;
  durationMs: number;
  parallelAgents: number;
  batchName?: string;
  aiUsage?: AiUsageSummary;
  summary: string;
  testCaseResults?: TestCaseResult[];
}

// ── Job domain ─────────────────────────────────────────────────────────────

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Job {
  jobId: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  inputFile?: string;
  url: string;
  framework: string;
  executionMode: ExecutionMode;
  headless: boolean;
  parallelAgents: number;
  autoScale?: boolean;
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
  parallelAgents?: number;
}

export interface JobLogsResponse {
  logs: string[];
}

/** The full batch report is returned directly as the report response. */
export type JobReportResponse = BatchReport;
