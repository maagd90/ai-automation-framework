import type { AiUsageSummary, BatchReport, ExecutionMode, FailureAnalysis, WebwrightReport } from '@ai-agent/shared-types';
import type { ChildRunResult } from './ChildJobRunner';

/**
 * Parses Playwright test-runner stdout to extract aggregate pass/fail/total counts.
 *
 * Playwright prints summary lines such as (tested against Playwright >=1.40):
 *   "10 passed (12.3s)"
 *   "8 passed, 2 failed (10s)"
 *   "2 failed (5s)"
 *
 * The patterns match the canonical summary line that appears at the end of a run.
 * If Playwright changes its output format in a future version, this function will
 * return null (graceful degradation — the report is still valid, just without
 * execution counts).
 *
 * Returns null when the stdout does not contain a recognisable summary.
 */
function parsePlaywrightCounts(
  stdout: string,
): { total: number; passed: number; failed: number } | null {
  // Match lines like "10 passed (1s)", "8 passed, 2 failed (1s)", "2 failed (1s)"
  const passedMatch = stdout.match(/(\d+)\s+passed/);
  const failedMatch = stdout.match(/(\d+)\s+failed/);

  const passed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
  const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;

  if (!passedMatch && !failedMatch) return null;

  return { total: passed + failed, passed, failed };
}

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
   * @param params.testRunStdout - Standard output from the Playwright test run (used to parse counts).
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
    testRunStdout?: string;
    allure?: {
      configured: boolean;
      resultsGenerated: boolean;
      reportGenerated: boolean;
    };
    webwright?: WebwrightReport;
    aiUsage?: AiUsageSummary;
    failureAnalysis?: FailureAnalysis;
  }): BatchReport {
    const {
      startedAt,
      childResults,
      parallelAgents,
      executionMode,
      testRunExitCode,
      testRunStdout,
      allure,
      webwright,
      aiUsage,
      failureAnalysis,
    } = params;
    const totalCases = childResults.length;
    const generationPassed = childResults.filter((r) => r.exitCode === 0).length;
    const generationFailed = totalCases - generationPassed;
    const durationMs = Date.now() - startedAt;

    // In generate-and-execute mode, test run exit code also contributes to overall status
    const executionEnabled = executionMode === 'generate-and-execute';
    const executionExitCode = executionEnabled ? (testRunExitCode ?? 1) : 0;
    const executionFailed = executionEnabled && executionExitCode !== 0;

    let status: BatchReport['status'];
    if (generationFailed === 0 && !executionFailed) {
      status = 'passed';
    } else if (generationPassed === 0 || (generationFailed === totalCases && !executionFailed)) {
      status = 'failed';
    } else {
      status = 'partial';
    }

    // Parse Playwright execution test counts from stdout when available.
    const playwrightCounts = executionEnabled && testRunStdout
      ? parsePlaywrightCounts(testRunStdout)
      : null;
    const executionPassedCount = playwrightCounts?.passed ?? (executionEnabled && !executionFailed ? totalCases : 0);
    const executionFailedCount = playwrightCounts?.failed ?? (executionEnabled && executionFailed ? totalCases : 0);
    const executionTotalCount = playwrightCounts?.total ?? (executionEnabled ? totalCases : 0);

    const generationSummary = `Generation ${generationPassed}/${totalCases} passed`;
    const executionSummary = executionEnabled
      ? `Execution ${executionPassedCount}/${executionTotalCount} passed (exitCode ${executionExitCode})`
      : undefined;

    let summary: string;
    if (status === 'passed') {
      summary = executionSummary
        ? `${generationSummary}. ${executionSummary}.`
        : `${generationSummary}.`;
    } else if (status === 'failed') {
      summary = executionSummary
        ? `${generationSummary}. ${executionSummary}.`
        : `${generationSummary}.`;
    } else {
      summary = executionSummary
        ? `${generationSummary}. ${executionSummary}.`
        : `${generationSummary}.`;
    }

    const report: BatchReport = {
      status,
      executionMode,
      generation: {
        total: totalCases,
        passed: generationPassed,
        failed: generationFailed,
      },
      execution: {
        enabled: executionEnabled,
        total: executionTotalCount,
        passed: executionPassedCount,
        failed: executionFailedCount,
        exitCode: executionExitCode,
      },
      allure: {
        configured: allure?.configured ?? true,
        resultsGenerated: allure?.resultsGenerated ?? false,
        reportGenerated: allure?.reportGenerated ?? false,
      },
      ...(webwright !== undefined ? { webwright } : {}),
      totalCases,
      passed: generationPassed,
      failed: generationFailed,
      durationMs,
      parallelAgents,
      aiUsage,
      failureAnalysis,
      summary,
    };

    if (executionEnabled) {
      report.testsTotal = executionTotalCount;
      report.testsPassed = executionPassedCount;
      report.testsFailed = executionFailedCount;
    }

    return report;
  }
}
