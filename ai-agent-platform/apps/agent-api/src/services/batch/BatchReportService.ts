import type { AiUsageSummary, BatchReport, ExecutionMode, FailureAnalysis } from '@ai-agent/shared-types';
import type { ChildRunResult } from './ChildJobRunner';

/**
 * Builds the final batch execution report for a completed job.
 *
 * Determines overall job status (passed / partial / failed) based on
 * generation success across all child runs and, in generate-and-execute mode,
 * the Playwright test run exit code.
 */
export class BatchReportService {
  /**
   * Constructs a BatchReport from the child run results and optional execution metadata.
   *
   * Status logic:
   * - 'passed'  — all test cases generated successfully (and tests passed, if executed).
   * - 'partial' — some test cases generated successfully, others failed.
   * - 'failed'  — all test cases failed generation, or test execution failed.
   *
   * @param params.startedAt - Unix timestamp (ms) when the job started; used to compute durationMs.
   * @param params.childResults - Results from each child agent run.
   * @param params.parallelAgents - Number of parallel agents that were used.
   * @param params.executionMode - 'generate-only' or 'generate-and-execute'.
   * @param params.testRunExitCode - Exit code from the Playwright test run (0 = passed).
   * @param params.aiUsage - Aggregated AI usage statistics for the job.
   * @param params.failureAnalysis - AI-generated failure analysis, if available.
   * @returns A complete BatchReport object ready for serialization and storage.
   */
  build(params: {
    startedAt: number;
    childResults: ChildRunResult[];
    parallelAgents: number;
    executionMode?: ExecutionMode;
    testRunExitCode?: number;
    aiUsage?: AiUsageSummary;
    failureAnalysis?: FailureAnalysis;
  }): BatchReport {
    const { startedAt, childResults, parallelAgents, executionMode, testRunExitCode, aiUsage, failureAnalysis } = params;
    const totalCases = childResults.length;
    const generationPassed = childResults.filter((r) => r.exitCode === 0).length;
    const generationFailed = totalCases - generationPassed;
    const durationMs = Date.now() - startedAt;

    // In generate-and-execute mode, test run exit code also contributes to overall status
    const executionFailed =
      executionMode === 'generate-and-execute' && (testRunExitCode ?? 0) !== 0;

    let status: BatchReport['status'];
    if (generationFailed === 0 && !executionFailed) {
      status = 'passed';
    } else if (generationPassed === 0 || (generationFailed === totalCases && !executionFailed)) {
      status = 'failed';
    } else {
      status = 'partial';
    }

    let summary: string;
    if (status === 'passed') {
      summary =
        executionMode === 'generate-and-execute'
          ? `All ${totalCases} test case(s) generated and executed successfully.`
          : `All ${totalCases} test case(s) generated successfully.`;
    } else if (status === 'failed') {
      summary =
        generationPassed === 0
          ? `All ${totalCases} test case(s) failed during generation.`
          : `Generation succeeded but test execution failed.`;
    } else {
      summary = `${generationPassed} of ${totalCases} test case(s) generated successfully; ${generationFailed} failed.`;
    }

    return {
      status,
      totalCases,
      passed: generationPassed,
      failed: generationFailed,
      durationMs,
      parallelAgents,
      aiUsage,
      failureAnalysis,
      summary,
    };
  }
}
