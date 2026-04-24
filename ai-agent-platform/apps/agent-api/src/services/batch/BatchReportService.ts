import type { BatchReport } from '@ai-agent/shared-types';
import type { ChildRunResult } from './ChildJobRunner';

export class BatchReportService {
  build(params: {
    startedAt: number;
    childResults: ChildRunResult[];
    parallelAgents: number;
    aiUsage?: number;
  }): BatchReport {
    const { startedAt, childResults, parallelAgents, aiUsage } = params;
    const totalCases = childResults.length;
    const passed = childResults.filter((r) => r.exitCode === 0).length;
    const failed = totalCases - passed;
    const durationMs = Date.now() - startedAt;

    let status: BatchReport['status'];
    if (failed === 0) {
      status = 'passed';
    } else if (passed === 0) {
      status = 'failed';
    } else {
      status = 'partial';
    }

    const summary =
      status === 'passed'
        ? `All ${totalCases} test case(s) generated successfully.`
        : status === 'failed'
          ? `All ${totalCases} test case(s) failed during generation.`
          : `${passed} of ${totalCases} test case(s) generated successfully; ${failed} failed.`;

    return {
      status,
      totalCases,
      passed,
      failed,
      durationMs,
      parallelAgents,
      aiUsage,
      summary,
    };
  }
}
