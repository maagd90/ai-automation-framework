import { DownloadIcon } from 'lucide-react';
import { getDownloadUrl } from '../api/jobs';

interface DownloadButtonProps {
  jobId: string;
  label?: string;
}

export default function DownloadButton({ jobId, label = 'Download Generated Framework' }: DownloadButtonProps) {
  return (
    <a
      href={getDownloadUrl(jobId)}
      download
      className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-medium px-4 py-2.5 rounded-lg text-sm transition-colors shadow-sm"
    >
      <DownloadIcon className="w-4 h-4" />
      {label}
    </a>
  );
}
