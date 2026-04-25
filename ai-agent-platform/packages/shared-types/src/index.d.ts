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
    preconditions?: string[];
    steps: TestStep[];
    expectedResults?: string[];
}
export interface TestCaseBatch {
    batchName: string;
    testCases: TestCase[];
}
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
