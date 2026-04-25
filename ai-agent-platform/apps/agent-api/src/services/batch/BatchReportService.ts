import type { AiUsageSummary, BatchReport, ExecutionMode, FailureAnalysis } from '@ai-agent/shared-types';
import type { ChildRunResult } from './ChildJobRunner';

export class BatchReportService {
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
