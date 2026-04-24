interface ExecutionConfigPanelProps {
  framework: string;
  onFrameworkChange: (v: string) => void;
  headless: boolean;
  onHeadlessChange: (v: boolean) => void;
  parallelAgents: number;
  onParallelAgentsChange: (v: number) => void;
  retryCount: number;
  onRetryCountChange: (v: number) => void;
  captureEvidence: boolean;
  onCaptureEvidenceChange: (v: boolean) => void;
}

const FRAMEWORKS = [
  { value: 'playwright-typescript', label: 'Playwright (TypeScript)' },
  { value: 'playwright-javascript', label: 'Playwright (JavaScript)' },
  { value: 'cypress', label: 'Cypress' },
];

const PARALLEL_OPTIONS = [1, 2, 3, 5, 10];

export default function ExecutionConfigPanel({
  framework,
  onFrameworkChange,
  headless,
  onHeadlessChange,
  parallelAgents,
  onParallelAgentsChange,
  retryCount,
  onRetryCountChange,
  captureEvidence,
  onCaptureEvidenceChange,
}: ExecutionConfigPanelProps) {
  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Framework</label>
        <select
          value={framework}
          onChange={(e) => onFrameworkChange(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
        >
          {FRAMEWORKS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Parallel Agents
        </label>
        <div className="flex gap-2 flex-wrap">
          {PARALLEL_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onParallelAgentsChange(n)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                parallelAgents === n
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400'
              }`}
            >
              {n === 1 ? '1 (sequential)' : n}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Retry Count
        </label>
        <input
          type="number"
          min={0}
          max={5}
          value={retryCount}
          onChange={(e) => onRetryCountChange(Math.min(5, Math.max(0, Number(e.target.value))))}
          className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
        />
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={headless}
            onChange={(e) => onHeadlessChange(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm font-medium text-gray-700">Headless mode (recommended for CI)</span>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={captureEvidence}
            onChange={(e) => onCaptureEvidenceChange(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm font-medium text-gray-700">Capture screenshots / evidence</span>
        </label>
      </div>
    </div>
  );
}
