import { useState } from 'react';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import type { AiProvider } from '@ai-agent/shared-types';

interface AiConfigPanelProps {
  provider: AiProvider;
  onProviderChange: (v: AiProvider) => void;
  apiKey: string;
  onApiKeyChange: (v: string) => void;
  model: string;
  onModelChange: (v: string) => void;
  baseUrl: string;
  onBaseUrlChange: (v: string) => void;
  usedForLocator: boolean;
  onUsedForLocatorChange: (v: boolean) => void;
  usedForSummary: boolean;
  onUsedForSummaryChange: (v: boolean) => void;
}

const PROVIDERS: { value: AiProvider; label: string }[] = [
  { value: 'none', label: 'None (no AI)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'azure', label: 'Azure OpenAI' },
  { value: 'local', label: 'Local LLM (Ollama / vLLM)' },
];

const needsKey = (p: AiProvider) => p === 'openai' || p === 'gemini' || p === 'azure';
const needsBaseUrl = (p: AiProvider) => p === 'azure' || p === 'local';
const needsModel = (p: AiProvider) => p !== 'none';

export default function AiConfigPanel({
  provider,
  onProviderChange,
  apiKey,
  onApiKeyChange,
  model,
  onModelChange,
  baseUrl,
  onBaseUrlChange,
  usedForLocator,
  onUsedForLocatorChange,
  usedForSummary,
  onUsedForSummaryChange,
}: AiConfigPanelProps) {
  const [showKey, setShowKey] = useState(false);

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">AI Provider</label>
        <select
          value={provider}
          onChange={(e) => onProviderChange(e.target.value as AiProvider)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
        >
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {needsKey(provider) && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            API Key <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder="sk-…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label={showKey ? 'Hide key' : 'Show key'}
            >
              {showKey ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Your key is sent over HTTPS and never stored or logged.
          </p>
        </div>
      )}

      {needsModel(provider) && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Model <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            placeholder={
              provider === 'openai'
                ? 'gpt-4o-mini'
                : provider === 'gemini'
                  ? 'gemini-pro'
                  : provider === 'local'
                    ? 'llama3'
                    : 'gpt-4'
            }
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
          />
        </div>
      )}

      {needsBaseUrl(provider) && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Base URL{provider === 'azure' && <span className="text-red-500"> *</span>}
          </label>
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => onBaseUrlChange(e.target.value)}
            placeholder={
              provider === 'local' ? 'http://localhost:11434' : 'https://<resource>.openai.azure.com'
            }
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
          />
        </div>
      )}

      {provider !== 'none' && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-gray-700">Use AI for:</p>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={usedForLocator}
              onChange={(e) => onUsedForLocatorChange(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm text-gray-700">Locator suggestions</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={usedForSummary}
              onChange={(e) => onUsedForSummaryChange(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm text-gray-700">Test execution summary</span>
          </label>
        </div>
      )}
    </div>
  );
}
