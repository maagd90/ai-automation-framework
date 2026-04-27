// ── Canonical test-case model ──────────────────────────────────────────────

export interface TestStep {
  order: number;
  action: string;
  target?: string;
  value?: string;
  /** Per-step expected result (Phase 2 addition, optional) */
  expected?: string;
  /** Original natural language text before NLP processing */
  originalText?: string;
  /** NLP confidence score 0-1 */
  confidence?: number;
  /** How the action was determined */
  nlpSource?: 'explicit-column' | 'nlp-rule' | 'ai-fallback';
}

export interface TestCase {
  id: string;
  name: string;
  description?: string;
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

export interface BatchReport {
  status: BatchStatus;
  totalCases: number;
  passed: number;
  failed: number;
  durationMs: number;
  parallelAgents: number;
  aiUsage?: AiUsageSummary;
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

// ── Phase 2: Excel Preview ─────────────────────────────────────────────────

export interface ExcelPreviewRow {
  testCaseId: string;
  testCaseName: string;
  stepNo: number;
  originalStep: string;
  detectedAction: string;
  target: string;
  value: string;
  expected: string;
  confidence: number;
  source: 'explicit-column' | 'nlp-rule' | 'ai-fallback';
}

export interface ExcelPreviewResponse {
  filename: string;
  totalSteps: number;
  lowConfidenceCount: number;
  rows: ExcelPreviewRow[];
}

// ── Phase 2: Locator Confidence ────────────────────────────────────────────

export interface LocatorConfidenceEntry {
  target: string;
  selectedLocator: string;
  confidenceScore: number;
  reason: string;
  fallbackLocators: string[];
}
