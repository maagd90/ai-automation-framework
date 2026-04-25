import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { PlayIcon, AlertCircleIcon } from 'lucide-react';
import axios from 'axios';
import FileUpload from '../components/FileUpload';
import UrlInput from '../components/UrlInput';
import ExecutionConfigPanel from '../components/ExecutionConfigPanel';
import AiConfigPanel from '../components/AiConfigPanel';
import { createJob } from '../api/jobs';
import type { AiProvider, ExecutionMode } from '@ai-agent/shared-types';

export default function DashboardPage() {
  const navigate = useNavigate();

  // Test input
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');

  // Execution config
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('generate-only');
  const [headless, setHeadless] = useState(true);
  const [parallelAgents, setParallelAgents] = useState(2);
  const [retryCount, setRetryCount] = useState(0);
  const [screenshotOnFailure, setScreenshotOnFailure] = useState(true);
  const [traceOnFailure, setTraceOnFailure] = useState(false);
  const [videoOnFailure, setVideoOnFailure] = useState(false);

  // AI config
  const [provider, setProvider] = useState<AiProvider>('none');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [usedForParsing, setUsedForParsing] = useState(false);
  const [usedForNaming, setUsedForNaming] = useState(false);
  const [usedForFailureAnalysis, setUsedForFailureAnalysis] = useState(false);

  const [validationError, setValidationError] = useState('');

  const mutation = useMutation({
    mutationFn: createJob,
    onSuccess: (res) => {
      navigate(`/jobs/${res.jobId}`);
    },
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        const response = error.response?.data as { error?: string } | undefined;
        if (response?.error) {
          setValidationError(response.error);
          return;
        }
      }
      setValidationError('Failed to create job. Please try again.');
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

    mutation.mutate({
      file,
      url,
      framework: 'playwright-ts',
      executionMode,
      headless,
      parallelAgents,
      retryCount,
      screenshotOnFailure,
      traceOnFailure,
      videoOnFailure,
      provider,
      apiKey: apiKey || undefined,
      model: model || undefined,
      baseUrl: baseUrl || undefined,
      usedForParsing,
      usedForNaming,
      usedForFailureAnalysis,
    });
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Generate Framework</h1>
        <p className="mt-2 text-gray-500">
          Upload your test case file, configure execution, and let the AI agent generate a
          Playwright automation framework for you.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* ── Test Input ──────────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border shadow-sm p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-800">Test Input</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Test Case File <span className="text-red-500">*</span>
            </label>
            <FileUpload onFileSelect={setFile} />
          </div>

          <UrlInput value={url} onChange={setUrl} />
        </section>

        {/* ── Execution Config ─────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Execution Config</h2>
          <ExecutionConfigPanel
            executionMode={executionMode}
            onExecutionModeChange={setExecutionMode}
            headless={headless}
            onHeadlessChange={setHeadless}
            parallelAgents={parallelAgents}
            onParallelAgentsChange={setParallelAgents}
            retryCount={retryCount}
            onRetryCountChange={setRetryCount}
            screenshotOnFailure={screenshotOnFailure}
            onScreenshotOnFailureChange={setScreenshotOnFailure}
            traceOnFailure={traceOnFailure}
            onTraceOnFailureChange={setTraceOnFailure}
            videoOnFailure={videoOnFailure}
            onVideoOnFailureChange={setVideoOnFailure}
          />
        </section>

        {/* ── AI Config ────────────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">AI Config</h2>
          <AiConfigPanel
            provider={provider}
            onProviderChange={setProvider}
            apiKey={apiKey}
            onApiKeyChange={setApiKey}
            model={model}
            onModelChange={setModel}
            baseUrl={baseUrl}
            onBaseUrlChange={setBaseUrl}
            usedForParsing={usedForParsing}
            onUsedForParsingChange={setUsedForParsing}
            usedForNaming={usedForNaming}
            onUsedForNamingChange={setUsedForNaming}
            usedForFailureAnalysis={usedForFailureAnalysis}
            onUsedForFailureAnalysisChange={setUsedForFailureAnalysis}
          />
        </section>

        {validationError && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            <AlertCircleIcon className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{validationError}</span>
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
