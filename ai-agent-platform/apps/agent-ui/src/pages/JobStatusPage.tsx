import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightIcon } from 'lucide-react';
import JobStatusCard from '../components/JobStatusCard';
import LogsViewer from '../components/LogsViewer';
import { getJobStatus, getJobLogs } from '../api/jobs';

export default function JobStatusPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  const statusQuery = useQuery({
    queryKey: ['job-status', jobId],
    queryFn: () => getJobStatus(jobId!),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'completed' || status === 'failed' ? false : 2000;
    },
    enabled: Boolean(jobId),
  });

  const logsQuery = useQuery({
    queryKey: ['job-logs', jobId],
    queryFn: () => getJobLogs(jobId!),
    refetchInterval: (_query) => {
      const status = statusQuery.data?.status;
      return status === 'completed' || status === 'failed' ? false : 2000;
    },
    enabled: Boolean(jobId),
  });

  const status = statusQuery.data?.status;
  const totalCases = statusQuery.data?.totalCases;
  const processedCases = statusQuery.data?.processedCases;

  // Deterministic progress: use processedCases/totalCases when available,
  // otherwise animate at 75% while running.
  const progressPercent: number = (() => {
    if (status === 'completed') return 100;
    if (status === 'failed') return 100;
    if (totalCases && totalCases > 0 && processedCases !== undefined) {
      return Math.round((processedCases / totalCases) * 100);
    }
    return status === 'running' ? 30 : 0;
  })();

  const progressLabel =
    totalCases && processedCases !== undefined
      ? `${processedCases} / ${totalCases} cases`
      : undefined;

  useEffect(() => {
    // Scroll to top when job reaches a terminal state so the user sees the final status card
    if (status === 'completed' || status === 'failed') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [status]);

  if (!jobId) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Job Status</h1>
        <p className="text-sm text-gray-500 mt-1 font-mono">Job ID: {jobId}</p>
      </div>

      {statusQuery.data && (
        <JobStatusCard jobId={jobId} status={statusQuery.data.status} />
      )}

      {/* Progress bar */}
      {status === 'running' && (
        <div className="space-y-1">
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className={`bg-brand-500 h-2 rounded-full transition-all duration-500 ${
                progressPercent < 30 ? 'animate-pulse' : ''
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {progressLabel && (
            <p className="text-xs text-gray-500 text-right">{progressLabel}</p>
          )}
        </div>
      )}

      <LogsViewer logs={logsQuery.data?.logs ?? []} />

      {(status === 'completed' || status === 'failed') && (
        <button
          onClick={() => navigate(`/jobs/${jobId}/result`)}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-medium px-4 py-2.5 rounded-lg text-sm transition-colors shadow-sm"
        >
          View Results
          <ArrowRightIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
