import type {
  AiUsageSummary,
  BatchReport,
  CaseStatus,
  ExecutionMode,
  TestCaseResult,
} from '@ai-agent/shared-types';
import type { ChildRunResult } from './ChildJobRunner';

export class BatchReportService {
  build(params: {
    startedAt: number;
    childResults: ChildRunResult[];
    parallelAgents: number;
    executionMode?: ExecutionMode;
    testRunExitCode?: number;
    aiUsage?: AiUsageSummary;
    executionResults?: TestCaseResult[];
    batchName?: string;
  }): BatchReport {
    const {
      startedAt,
      childResults,
      parallelAgents,
      executionMode,
      testRunExitCode,
      aiUsage,
      executionResults,
      batchName,
    } = params;
    const totalCases = childResults.length;
    const generationPassed = childResults.filter((r) => r.exitCode === 0).length;
    const generationFailed = totalCases - generationPassed;
    const durationMs = Date.now() - startedAt;

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

    const testCaseResults = this.mergeTestCaseResults(childResults, executionResults);

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

    const executionPassed = testCaseResults.filter((r) => r.executionStatus === 'passed').length;
    const executionFailedCount = testCaseResults.filter((r) => r.executionStatus === 'failed').length;

    if (executionMode === 'generate-and-execute' && executionResults && executionResults.length > 0) {
      summary = `${executionPassed} of ${totalCases} test case(s) executed successfully; ${executionFailedCount} failed.`;
      if (executionFailedCount === 0 && generationFailed === 0) status = 'passed';
      else if (executionPassed === 0 && generationFailed === totalCases) status = 'failed';
      else status = 'partial';
    }

    return {
      status,
      totalCases,
      passed: executionMode === 'generate-and-execute' && executionResults?.length
        ? executionPassed
        : generationPassed,
      failed: executionMode === 'generate-and-execute' && executionResults?.length
        ? executionFailedCount
        : generationFailed,
      durationMs,
      parallelAgents,
      batchName,
      aiUsage,
      summary,
      testCaseResults,
    };
  }

  private mergeTestCaseResults(
    childResults: ChildRunResult[],
    executionResults?: TestCaseResult[],
  ): TestCaseResult[] {
    const executionById = new Map(
      (executionResults ?? []).map((result) => [result.id, result]),
    );

    return childResults.map((child) => {
      const generationStatus: CaseStatus = child.exitCode === 0 ? 'passed' : 'failed';
      const execution = executionById.get(child.testCaseId);

      return {
        id: child.testCaseId,
        name: child.testCaseName,
        priority: child.priority as TestCaseResult['priority'],
        generationStatus,
        executionStatus: execution?.executionStatus,
        durationMs: execution?.durationMs ?? child.durationMs,
        error: execution?.error ?? (child.exitCode !== 0 ? 'Generation failed' : undefined),
        screenshotUrl: execution?.screenshotUrl,
        traceUrl: execution?.traceUrl,
        inputSteps: child.inputSteps,
        steps: execution?.steps ?? [],
      };
    });
  }
}
