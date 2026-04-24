import type { JobReportResponse } from '@ai-agent/shared-types';
import { CheckCircleIcon, XCircleIcon, AlertCircleIcon, ClockIcon } from 'lucide-react';

interface ReportSummaryProps {
  report: JobReportResponse;
}

export default function ReportSummary({ report }: ReportSummaryProps) {
  const passed = report.status === 'passed';
  const partial = report.status === 'partial';

  const borderClass = passed
    ? 'border-green-400 bg-green-50'
    : partial
      ? 'border-yellow-400 bg-yellow-50'
      : 'border-red-400 bg-red-50';

  const Icon = passed ? CheckCircleIcon : partial ? AlertCircleIcon : XCircleIcon;
  const iconClass = passed ? 'text-green-600' : partial ? 'text-yellow-600' : 'text-red-600';
  const titleClass = passed ? 'text-green-700' : partial ? 'text-yellow-700' : 'text-red-700';
  const title = passed
    ? 'Generation Successful'
    : partial
      ? 'Partial Success'
      : 'Generation Failed';

  return (
    <div className={`rounded-lg border-2 p-5 ${borderClass}`}>
      <div className="flex items-center gap-3 mb-4">
        <Icon className={`w-7 h-7 ${iconClass}`} />
        <h3 className={`text-lg font-bold ${titleClass}`}>{title}</h3>
      </div>

      {/* Batch stats grid */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded-lg border px-3 py-2 text-center">
          <p className="text-xs text-gray-500 mb-0.5">Total</p>
          <p className="text-xl font-bold text-gray-800">{report.totalCases}</p>
        </div>
        <div className="bg-white rounded-lg border px-3 py-2 text-center">
          <p className="text-xs text-gray-500 mb-0.5">Passed</p>
          <p className="text-xl font-bold text-green-600">{report.passed}</p>
        </div>
        <div className="bg-white rounded-lg border px-3 py-2 text-center">
          <p className="text-xs text-gray-500 mb-0.5">Failed</p>
          <p className="text-xl font-bold text-red-600">{report.failed}</p>
        </div>
      </div>

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
        {report.aiUsage !== undefined && report.aiUsage > 0 && (
          <div className="text-sm text-gray-600 col-span-2">
            AI calls: <strong>{report.aiUsage}</strong>
          </div>
        )}
      </div>

      <p className="text-sm text-gray-700 bg-white rounded border px-3 py-2">{report.summary}</p>
    </div>
  );
}
