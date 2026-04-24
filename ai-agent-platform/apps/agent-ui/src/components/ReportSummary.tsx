import type { JobReportResponse } from '@ai-agent/shared-types';
import { CheckCircleIcon, XCircleIcon, ClockIcon } from 'lucide-react';

interface ReportSummaryProps {
  report: JobReportResponse;
}

export default function ReportSummary({ report }: ReportSummaryProps) {
  const passed = report.status === 'passed';

  return (
    <div className={`rounded-lg border-2 p-5 ${passed ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50'}`}>
      <div className="flex items-center gap-3 mb-4">
        {passed ? (
          <CheckCircleIcon className="w-7 h-7 text-green-600" />
        ) : (
          <XCircleIcon className="w-7 h-7 text-red-600" />
        )}
        <h3 className={`text-lg font-bold ${passed ? 'text-green-700' : 'text-red-700'}`}>
          {passed ? 'Generation Successful' : 'Generation Failed'}
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <ClockIcon className="w-4 h-4" />
          <span>Duration: <strong>{(report.durationMs / 1000).toFixed(1)}s</strong></span>
        </div>
        <div className="text-sm text-gray-600">
          Status: <strong className={passed ? 'text-green-600' : 'text-red-600'}>{report.status.toUpperCase()}</strong>
        </div>
      </div>

      <p className="mt-3 text-sm text-gray-700 bg-white rounded border px-3 py-2">{report.summary}</p>
    </div>
  );
}
