import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { HomeIcon, AlertCircleIcon } from 'lucide-react';
import ReportSummary from '../components/ReportSummary';
import DownloadButton from '../components/DownloadButton';
import { getJobReport, getJobStatus } from '../api/jobs';

export default function ResultPage() {
  const { jobId } = useParams<{ jobId: string }>();

  const statusQuery = useQuery({
    queryKey: ['job-status', jobId],
    queryFn: () => getJobStatus(jobId!),
    enabled: Boolean(jobId),
  });

  const reportQuery = useQuery({
    queryKey: ['job-report', jobId],
    queryFn: () => getJobReport(jobId!),
    enabled: Boolean(jobId),
  });

  if (!jobId) return null;

  const jobStatus = statusQuery.data?.status;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Results</h1>
          <p className="text-sm text-gray-500 mt-1 font-mono">Job ID: {jobId}</p>
        </div>
        <Link
          to="/"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-600 transition-colors"
        >
          <HomeIcon className="w-4 h-4" />
          New Job
        </Link>
      </div>

      {reportQuery.isPending && (
        <div className="text-center py-10 text-gray-400">Loading report…</div>
      )}

      {reportQuery.isError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircleIcon className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Report not available. The job may still be running or has failed without a report.</span>
        </div>
      )}

      {reportQuery.data && <ReportSummary report={reportQuery.data} />}

      {jobStatus === 'completed' && (
        <div className="flex flex-wrap gap-3">
          <DownloadButton jobId={jobId} label="Download Generated Framework (ZIP)" />
          <a
            href={`/api/jobs/${jobId}/report`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 border border-gray-300 hover:border-brand-500 text-gray-700 hover:text-brand-600 font-medium px-4 py-2.5 rounded-lg text-sm transition-colors"
          >
            Download Execution Report (JSON)
          </a>
        </div>
      )}
    </div>
  );
}
