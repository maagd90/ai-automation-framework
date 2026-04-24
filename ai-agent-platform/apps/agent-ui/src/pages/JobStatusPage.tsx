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
    refetchInterval: (query) => {
      const status = statusQuery.data?.status;
      return status === 'completed' || status === 'failed' ? false : 2000;
    },
    enabled: Boolean(jobId),
  });

  const status = statusQuery.data?.status;

  useEffect(() => {
    if (status === 'completed' || status === 'failed') {
      // Brief pause so user can see the final status
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
        <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
          <div className="bg-brand-500 h-1.5 rounded-full animate-pulse w-3/4 transition-all duration-500" />
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
