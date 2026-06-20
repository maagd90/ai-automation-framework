import { Link } from 'react-router-dom';
import type { JobReportResponse, TestCaseResult } from '@ai-agent/shared-types';
import { CheckCircleIcon, XCircleIcon, AlertCircleIcon, ClockIcon } from 'lucide-react';

interface ReportSummaryProps {
  report: JobReportResponse;
  jobId?: string;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    passed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    skipped: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${styles[status] ?? styles.skipped}`}>
      {status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority?: string }) {
  if (!priority) return null;
  const styles: Record<string, string> = {
    high: 'bg-red-50 text-red-700 border-red-200',
    medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    low: 'bg-blue-50 text-blue-700 border-blue-200',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded border text-xs font-medium ${styles[priority] ?? ''}`}>
      {priority}
    </span>
  );
}

function formatInputSteps(result: TestCaseResult): string {
  if (!result.inputSteps?.length) return '—';
  return result.inputSteps
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s) => `${s.order}. ${s.action}${s.target ? ` → ${s.target}` : ''}${s.value ? ` (${s.value})` : ''}`)
    .join('; ');
}

function TestCaseRow({ result, jobId }: { result: TestCaseResult; jobId?: string }) {
  return (
    <tr className="border-t">
      <td className="px-3 py-2 font-mono text-xs">
        {jobId ? (
          <Link to={`/jobs/${jobId}/cases/${result.id}`} className="text-brand-600 hover:underline">
            {result.id}
          </Link>
        ) : (
          result.id
        )}
      </td>
      <td className="px-3 py-2 text-sm">{result.name}</td>
      <td className="px-3 py-2 text-xs text-gray-600 max-w-xs truncate" title={formatInputSteps(result)}>
        {formatInputSteps(result)}
      </td>
      <td className="px-3 py-2"><PriorityBadge priority={result.priority} /></td>
      <td className="px-3 py-2"><StatusBadge status={result.generationStatus} /></td>
      <td className="px-3 py-2">
        {result.executionStatus ? <StatusBadge status={result.executionStatus} /> : '—'}
      </td>
      <td className="px-3 py-2 text-xs text-gray-500">{(result.durationMs / 1000).toFixed(1)}s</td>
      <td className="px-3 py-2 text-xs">
        {result.screenshotUrl && (
          <a href={result.screenshotUrl} className="text-brand-600 hover:underline mr-2">Screenshot</a>
        )}
        {result.traceUrl && (
          <a href={result.traceUrl} className="text-brand-600 hover:underline">Trace</a>
        )}
      </td>
    </tr>
  );
}

export default function ReportSummary({ report, jobId }: ReportSummaryProps) {
  const { status } = report;
  const passRate = report.totalCases > 0 ? Math.round((report.passed / report.totalCases) * 100) : 0;

  const styleMap: Record<typeof status, {
    border: string;
    Icon: typeof CheckCircleIcon;
    iconClass: string;
    titleClass: string;
    title: string;
  }> = {
    passed:  { border: 'border-green-400 bg-green-50',   Icon: CheckCircleIcon,  iconClass: 'text-green-600',  titleClass: 'text-green-700',  title: 'Run Successful' },
    partial: { border: 'border-yellow-400 bg-yellow-50', Icon: AlertCircleIcon,  iconClass: 'text-yellow-600', titleClass: 'text-yellow-700', title: 'Partial Success' },
    failed:  { border: 'border-red-400 bg-red-50',       Icon: XCircleIcon,      iconClass: 'text-red-600',    titleClass: 'text-red-700',    title: 'Run Failed' },
  };

  const { border: borderClass, Icon, iconClass, titleClass, title } = styleMap[status];

  return (
    <div className={`rounded-lg border-2 p-5 ${borderClass}`}>
      <div className="flex items-center gap-3 mb-1">
        <Icon className={`w-7 h-7 ${iconClass}`} />
        <h3 className={`text-lg font-bold ${titleClass}`}>{title}</h3>
      </div>
      {report.batchName && (
        <p className="text-sm text-gray-600 mb-4 ml-10">{report.batchName}</p>
      )}

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

      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-600 mb-1">
          <span>Pass rate</span>
          <span className="font-semibold">{passRate}%</span>
        </div>
        <div className="h-2.5 bg-white rounded-full border overflow-hidden">
          <div
            className={`h-full transition-all ${passRate === 100 ? 'bg-green-500' : passRate === 0 ? 'bg-red-500' : 'bg-yellow-500'}`}
            style={{ width: `${passRate}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-3">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <ClockIcon className="w-4 h-4" />
          <span>Duration: <strong>{(report.durationMs / 1000).toFixed(1)}s</strong></span>
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

      <p className="text-sm text-gray-700 bg-white rounded border px-3 py-2 mb-4">{report.summary}</p>

      {report.testCaseResults && report.testCaseResults.length > 0 && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Steps (Input)</th>
                <th className="px-3 py-2">Priority</th>
                <th className="px-3 py-2">Generated</th>
                <th className="px-3 py-2">Executed</th>
                <th className="px-3 py-2">Duration</th>
                <th className="px-3 py-2">Artifacts</th>
              </tr>
            </thead>
            <tbody>
              {report.testCaseResults.map((result) => (
                <TestCaseRow key={result.id} result={result} jobId={jobId} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
