import type { JobReportResponse } from '@ai-agent/shared-types';
import { CheckCircleIcon, XCircleIcon, AlertCircleIcon, ClockIcon } from 'lucide-react';

interface ReportSummaryProps {
  report: JobReportResponse;
}

export default function ReportSummary({ report }: ReportSummaryProps) {
  const { status } = report;

  const isExecuteMode = report.executionMode === 'generate-and-execute';
  const executionFailed = isExecuteMode && (report.testsFailed ?? 0) > 0;
  const executionSucceeded = isExecuteMode && status === 'passed';

  const styleMap: Record<typeof status, {
    border: string;
    Icon: typeof CheckCircleIcon;
    iconClass: string;
    titleClass: string;
    title: string;
  }> = {
    passed:  { border: 'border-green-400 bg-green-50',   Icon: CheckCircleIcon,  iconClass: 'text-green-600',  titleClass: 'text-green-700',  title: executionSucceeded ? 'Generated & Executed Successfully' : 'Generation Successful' },
    partial: { border: 'border-yellow-400 bg-yellow-50', Icon: AlertCircleIcon,  iconClass: 'text-yellow-600', titleClass: 'text-yellow-700', title: executionFailed ? 'Execution Failed' : 'Partial Generation' },
    failed:  { border: 'border-red-400 bg-red-50',       Icon: XCircleIcon,      iconClass: 'text-red-600',    titleClass: 'text-red-700',    title: 'Failed'      },
  };

  const { border: borderClass, Icon, iconClass, titleClass, title } = styleMap[status];

  return (
    <div className={`rounded-lg border-2 p-5 ${borderClass}`}>
      <div className="flex items-center gap-3 mb-4">
        <Icon className={`w-7 h-7 ${iconClass}`} />
        <h3 className={`text-lg font-bold ${titleClass}`}>{title}</h3>
      </div>

      {/* Generation stats */}
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Generation</p>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded-lg border px-3 py-2 text-center">
          <p className="text-xs text-gray-500 mb-0.5">Total</p>
          <p className="text-xl font-bold text-gray-800">{report.totalCases}</p>
        </div>
        <div className="bg-white rounded-lg border px-3 py-2 text-center">
          <p className="text-xs text-gray-500 mb-0.5">Generated</p>
          <p className="text-xl font-bold text-green-600">{report.passed}</p>
        </div>
        <div className="bg-white rounded-lg border px-3 py-2 text-center">
          <p className="text-xs text-gray-500 mb-0.5">Failed</p>
          <p className="text-xl font-bold text-red-600">{report.failed}</p>
        </div>
      </div>

      {/* Execution stats — only shown in generate-and-execute mode */}
      {isExecuteMode && (
        <>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Execution (Playwright)</p>
          {report.testsTotal != null ? (
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-white rounded-lg border px-3 py-2 text-center">
                <p className="text-xs text-gray-500 mb-0.5">Total</p>
                <p className="text-xl font-bold text-gray-800">{report.testsTotal}</p>
              </div>
              <div className="bg-white rounded-lg border px-3 py-2 text-center">
                <p className="text-xs text-gray-500 mb-0.5">Passed</p>
                <p className="text-xl font-bold text-green-600">{report.testsPassed ?? 0}</p>
              </div>
              <div className="bg-white rounded-lg border px-3 py-2 text-center">
                <p className="text-xs text-gray-500 mb-0.5">Failed</p>
                <p className="text-xl font-bold text-red-600">{report.testsFailed ?? 0}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 mb-4 bg-white rounded border px-3 py-2">
              Execution results not available (tests may have failed to run).
            </p>
          )}
        </>
      )}

      <div className="grid grid-cols-2 gap-4 mb-3">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <ClockIcon className="w-4 h-4" />
          <span>
            Duration: <strong>{(report.durationMs / 1000).toFixed(1)}s</strong>
          </span>
        </div>
        <div className="text-sm text-gray-600">
          Parallel agents: <strong>{report.parallelAgents}</strong>
        </div>
        {report.aiUsage !== undefined && report.aiUsage.calls > 0 && (
          <div className="text-sm text-gray-600 col-span-2">
            AI calls: <strong>{report.aiUsage.calls}</strong>
          </div>
        )}
      </div>

      <p className="text-sm text-gray-700 bg-white rounded border px-3 py-2">{report.summary}</p>
    </div>
  );
}
