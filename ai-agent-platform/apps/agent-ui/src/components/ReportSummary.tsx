import type { JobReportResponse } from '@ai-agent/shared-types';
import { CheckCircleIcon, XCircleIcon, AlertCircleIcon, ClockIcon, BotIcon, BarChartIcon } from 'lucide-react';

interface ReportSummaryProps {
  report: JobReportResponse;
}

function StatCard({ label, value, className = '' }: { label: string; value: string | number; className?: string }) {
  return (
    <div className="bg-white rounded-lg border px-3 py-2 text-center">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className={`text-xl font-bold ${className}`}>{value}</p>
    </div>
  );
}

export default function ReportSummary({ report }: ReportSummaryProps) {
  const { status } = report;

  const styleMap: Record<typeof status, {
    border: string;
    Icon: typeof CheckCircleIcon;
    iconClass: string;
    titleClass: string;
    title: string;
  }> = {
    passed:  { border: 'border-green-400 bg-green-50',   Icon: CheckCircleIcon,  iconClass: 'text-green-600',  titleClass: 'text-green-700',  title: 'Generation Successful' },
    partial: { border: 'border-yellow-400 bg-yellow-50', Icon: AlertCircleIcon,  iconClass: 'text-yellow-600', titleClass: 'text-yellow-700', title: 'Partial Success'        },
    failed:  { border: 'border-red-400 bg-red-50',       Icon: XCircleIcon,      iconClass: 'text-red-600',    titleClass: 'text-red-700',    title: 'Generation Failed'      },
  };

  const { border: borderClass, Icon, iconClass, titleClass, title } = styleMap[status];

  const successRate = report.totalCases > 0
    ? Math.round((report.passed / report.totalCases) * 100)
    : 0;

  return (
    <div className={`rounded-lg border-2 p-5 ${borderClass}`}>
      {/* Title */}
      <div className="flex items-center gap-3 mb-4">
        <Icon className={`w-7 h-7 ${iconClass}`} />
        <h3 className={`text-lg font-bold ${titleClass}`}>{title}</h3>
      </div>

      {/* Batch stats grid */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <StatCard label="Total" value={report.totalCases} className="text-gray-800" />
        <StatCard label="Passed" value={report.passed} className="text-green-600" />
        <StatCard label="Failed" value={report.failed} className="text-red-600" />
        <StatCard label="Success Rate" value={`${successRate}%`} className={successRate === 100 ? 'text-green-600' : successRate > 50 ? 'text-yellow-600' : 'text-red-600'} />
      </div>

      {/* Duration and parallel agents row */}
      <div className="grid grid-cols-2 gap-4 mb-3">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <ClockIcon className="w-4 h-4 text-gray-400" />
          <span>Duration: <strong>{(report.durationMs / 1000).toFixed(1)}s</strong></span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <BarChartIcon className="w-4 h-4 text-gray-400" />
          <span>Parallel agents: <strong>{report.parallelAgents}</strong></span>
        </div>
      </div>

      {/* AI usage */}
      {report.aiUsage !== undefined && report.aiUsage.calls > 0 && (
        <div className="flex items-start gap-2 mb-3 bg-white rounded-lg border px-3 py-2">
          <BotIcon className="w-4 h-4 text-brand-500 mt-0.5 shrink-0" />
          <div className="text-sm text-gray-700 space-y-0.5">
            <p><strong>AI Usage</strong> — {report.aiUsage.provider} {report.aiUsage.model ? `(${report.aiUsage.model})` : ''}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
              <span>Total calls: <strong className="text-gray-700">{report.aiUsage.calls}</strong></span>
              {report.aiUsage.parsingCalls > 0 && (
                <span>Parsing: <strong className="text-gray-700">{report.aiUsage.parsingCalls}</strong></span>
              )}
              {report.aiUsage.namingCalls > 0 && (
                <span>Naming: <strong className="text-gray-700">{report.aiUsage.namingCalls}</strong></span>
              )}
              {report.aiUsage.failureAnalysisCalls > 0 && (
                <span>Failure analysis: <strong className="text-gray-700">{report.aiUsage.failureAnalysisCalls}</strong></span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Summary */}
      <p className="text-sm text-gray-700 bg-white rounded border px-3 py-2">{report.summary}</p>
    </div>
  );
}
