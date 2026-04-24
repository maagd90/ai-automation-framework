export interface ExecutionResult {
  specFile: string;
  status: 'passed' | 'failed' | 'error';
  startedAt: string;
  endedAt: string;
  durationMs: number;
  stdout: string;
  stderr: string;
}
