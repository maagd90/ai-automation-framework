import type { ExecutionMode } from '@ai-agent/shared-types';

interface ExecutionConfigPanelProps {
  executionMode: ExecutionMode;
  onExecutionModeChange: (v: ExecutionMode) => void;
  headless: boolean;
  onHeadlessChange: (v: boolean) => void;
  forceHeadless?: boolean;
  parallelAgents: number;
  onParallelAgentsChange: (v: number) => void;
  autoScale: boolean;
  onAutoScaleChange: (v: boolean) => void;
  retryCount: number;
  onRetryCountChange: (v: number) => void;
  screenshotOnFailure: boolean;
  onScreenshotOnFailureChange: (v: boolean) => void;
  traceOnFailure: boolean;
  onTraceOnFailureChange: (v: boolean) => void;
  videoOnFailure: boolean;
  onVideoOnFailureChange: (v: boolean) => void;
}

const PARALLEL_OPTIONS = [1, 2, 3, 5, 10];
const RETRY_OPTIONS = [0, 1, 2];

export default function ExecutionConfigPanel({
  executionMode,
  onExecutionModeChange,
  headless,
  onHeadlessChange,
  forceHeadless = false,
  parallelAgents,
  onParallelAgentsChange,
  autoScale,
  onAutoScaleChange,
  retryCount,
  onRetryCountChange,
  screenshotOnFailure,
  onScreenshotOnFailureChange,
  traceOnFailure,
  onTraceOnFailureChange,
  videoOnFailure,
  onVideoOnFailureChange,
}: ExecutionConfigPanelProps) {
  return (
    <div className="space-y-5">
      {/* Execution Mode */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Execution Mode</label>
        <div className="flex gap-2">
          {(
            [
              { value: 'generate-only', label: 'Generate Only' },
              { value: 'generate-and-execute', label: 'Generate + Execute' },
            ] as { value: ExecutionMode; label: string }[]
          ).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => onExecutionModeChange(value)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                executionMode === value
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Auto-scale */}
      <div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={autoScale}
            onChange={(e) => onAutoScaleChange(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm text-gray-700">
            Auto-scale agents <span className="text-gray-400">(adjust concurrency from test count and system resources)</span>
          </span>
        </label>
      </div>

      {/* Parallel Agents */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Parallel Agents {autoScale && <span className="text-gray-400 font-normal">(max when auto-scale is on)</span>}
        </label>
        <div className="flex gap-2 flex-wrap">
          {PARALLEL_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onParallelAgentsChange(n)}
              disabled={autoScale}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                parallelAgents === n
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400'
              } ${autoScale ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {n === 1 ? '1 (sequential)' : n}
            </button>
          ))}
        </div>
      </div>

      {/* Retry Failed Cases */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Retry Failed Cases</label>
        <div className="flex gap-2">
          {RETRY_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onRetryCountChange(n)}
              className={`px-5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                retryCount === n
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Browser Mode */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Browser Mode</p>
        <div className="flex flex-col gap-2">
          {forceHeadless ? (
            <p className="text-sm text-gray-600">
              Headless <span className="text-gray-400">(required on this server)</span>
            </p>
          ) : (
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={headless}
                onChange={(e) => onHeadlessChange(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm text-gray-700">
                Headless <span className="text-gray-400">(default, recommended for CI)</span>
              </span>
            </label>
          )}
        </div>
      </div>

      {/* Evidence */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Evidence</p>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={screenshotOnFailure}
              onChange={(e) => onScreenshotOnFailureChange(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm text-gray-700">
              Screenshot on failure <span className="text-gray-400">(default)</span>
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={traceOnFailure}
              onChange={(e) => onTraceOnFailureChange(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm text-gray-700">Trace on failure</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={videoOnFailure}
              onChange={(e) => onVideoOnFailureChange(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm text-gray-700">Video on failure</span>
          </label>
        </div>
      </div>
    </div>
  );
}
