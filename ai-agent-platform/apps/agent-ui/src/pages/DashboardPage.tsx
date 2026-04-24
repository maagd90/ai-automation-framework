import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { PlayIcon, AlertCircleIcon } from 'lucide-react';
import FileUpload from '../components/FileUpload';
import UrlInput from '../components/UrlInput';
import FrameworkSelector from '../components/FrameworkSelector';
import { createJob } from '../api/jobs';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [framework, setFramework] = useState('playwright-typescript');
  const [headless, setHeadless] = useState(true);
  const [validationError, setValidationError] = useState('');

  const mutation = useMutation({
    mutationFn: (data: FormData) => createJob(data),
    onSuccess: (res) => {
      navigate(`/jobs/${res.jobId}`);
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setValidationError('');

    if (!file) {
      setValidationError('Please upload a test case file.');
      return;
    }
    if (!url.trim()) {
      setValidationError('Please enter a target URL.');
      return;
    }

    try {
      new URL(url);
    } catch {
      setValidationError('Please enter a valid URL (e.g. https://example.com).');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('url', url);
    formData.append('framework', framework);
    formData.append('headless', String(headless));

    mutation.mutate(formData);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Generate Framework</h1>
        <p className="mt-2 text-gray-500">
          Upload your test case file, provide the target URL, and let the AI agent generate a
          Playwright automation framework for you.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border shadow-sm p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Test Case File <span className="text-red-500">*</span>
          </label>
          <FileUpload onFileSelect={setFile} />
        </div>

        <UrlInput value={url} onChange={setUrl} />

        <FrameworkSelector value={framework} onChange={setFramework} />

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="headless"
            checked={headless}
            onChange={(e) => setHeadless(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <label htmlFor="headless" className="text-sm font-medium text-gray-700">
            Headless mode (recommended for CI)
          </label>
        </div>

        {(validationError || mutation.isError) && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            <AlertCircleIcon className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{validationError || 'Failed to create job. Please try again.'}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors shadow-sm"
        >
          <PlayIcon className="w-5 h-5" />
          {mutation.isPending ? 'Creating job…' : 'Generate Framework'}
        </button>
      </form>
    </div>
  );
}
