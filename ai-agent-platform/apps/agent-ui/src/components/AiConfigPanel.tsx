import { useState } from 'react';
import { EyeIcon, EyeOffIcon, ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import type { AiProvider } from '@ai-agent/shared-types';
import type { ServerFeatureFlags } from '../api/config';

interface AiConfigPanelProps {
  provider: AiProvider;
  onProviderChange: (v: AiProvider) => void;
  apiKey: string;
  onApiKeyChange: (v: string) => void;
  model: string;
  onModelChange: (v: string) => void;
  baseUrl: string;
  onBaseUrlChange: (v: string) => void;
  usedForParsing: boolean;
  onUsedForParsingChange: (v: boolean) => void;
  usedForNaming: boolean;
  onUsedForNamingChange: (v: boolean) => void;
  usedForFailureAnalysis: boolean;
  onUsedForFailureAnalysisChange: (v: boolean) => void;
  features: ServerFeatureFlags;
}

const ALL_PROVIDERS: { value: AiProvider; label: string; requiresLocalLlm?: boolean }[] = [
  { value: 'none', label: 'None (no AI)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'azure', label: 'Azure OpenAI' },
  { value: 'local', label: 'Local LLM (Ollama / vLLM)', requiresLocalLlm: true },
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
  usedForParsing,
  onUsedForParsingChange,
  usedForNaming,
  onUsedForNamingChange,
  usedForFailureAnalysis,
  onUsedForFailureAnalysisChange,
  features,
}: AiConfigPanelProps) {
  const [showKey, setShowKey] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // When AI providers are disabled, always show provider=none and collapse the panel
  if (!features.aiProviders) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">AI Assistance</span>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            Disabled — Phase 1 demo
          </span>
        </div>
        <p className="text-xs text-gray-400">
          AI provider integration is not enabled in this deployment. Framework generation uses
          built-in rule-based parsing and locator strategies.
        </p>
      </div>
    );
  }

  // Filter providers based on feature flags
  const availableProviders = ALL_PROVIDERS.filter(
    (p) => !p.requiresLocalLlm || features.localLlm,
  );

  return (
    <div className="space-y-3">
      {/* ── Collapsible toggle ──────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-brand-600 transition-colors"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDownIcon className="w-4 h-4" />
        ) : (
          <ChevronRightIcon className="w-4 h-4" />
        )}
        Advanced AI Settings
        {provider !== 'none' && (
          <span className="ml-1 text-xs text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">
            {availableProviders.find((p) => p.value === provider)?.label ?? provider}
          </span>
        )}
      </button>

      {expanded && (
        <div className="space-y-5 pt-1 pl-6 border-l-2 border-gray-100">
          {/* AI Provider */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">AI Provider</label>
            <select
              value={provider}
              onChange={(e) => onProviderChange(e.target.value as AiProvider)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            >
              {availableProviders.map((p) => (
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
                API key is used only for this job. It is not stored, logged, or included in the generated ZIP.
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
                  checked={usedForParsing}
                  onChange={(e) => onUsedForParsingChange(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm text-gray-700">Parsing</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={usedForNaming}
                  onChange={(e) => onUsedForNamingChange(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm text-gray-700">Naming</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={usedForFailureAnalysis}
                  onChange={(e) => onUsedForFailureAnalysisChange(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm text-gray-700">Failure Analysis</span>
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

