import type { JobStatus } from '@ai-agent/shared-types';
import { CheckCircleIcon, XCircleIcon, LoaderIcon, ClockIcon } from 'lucide-react';

interface JobStatusCardProps {
  jobId: string;
  status: JobStatus;
}

const STATUS_CONFIG: Record<JobStatus, { label: string; color: string; Icon: React.ElementType }> = {
  pending: { label: 'Pending', color: 'text-yellow-600 bg-yellow-50 border-yellow-200', Icon: ClockIcon },
  running: { label: 'Running', color: 'text-blue-600 bg-blue-50 border-blue-200', Icon: LoaderIcon },
  completed: { label: 'Completed', color: 'text-green-600 bg-green-50 border-green-200', Icon: CheckCircleIcon },
  failed: { label: 'Failed', color: 'text-red-600 bg-red-50 border-red-200', Icon: XCircleIcon },
};

export default function JobStatusCard({ jobId, status }: JobStatusCardProps) {
  const cfg = STATUS_CONFIG[status];
  const { Icon } = cfg;

  return (
    <div className={`flex items-center gap-3 border rounded-lg px-4 py-3 ${cfg.color}`}>
      <Icon className={`w-5 h-5 ${status === 'running' ? 'animate-spin' : ''}`} />
      <div>
        <p className="text-xs font-medium uppercase tracking-wider opacity-70">Status</p>
        <p className="font-semibold">{cfg.label}</p>
      </div>
      <div className="ml-auto text-right">
        <p className="text-xs opacity-70">Job ID</p>
        <p className="text-xs font-mono">{jobId.slice(0, 8)}…</p>
      </div>
    </div>
  );
}
