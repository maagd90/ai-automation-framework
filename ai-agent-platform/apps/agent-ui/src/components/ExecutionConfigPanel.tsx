import type { ExecutionMode, AllocationMode } from '@ai-agent/shared-types';

interface ExecutionConfigPanelProps {
  executionMode: ExecutionMode;
  onExecutionModeChange: (v: ExecutionMode) => void;
  allocationMode: AllocationMode;
  onAllocationModeChange: (v: AllocationMode) => void;
  headless: boolean;
  onHeadlessChange: (v: boolean) => void;
  parallelAgents: number;
  onParallelAgentsChange: (v: number) => void;
  retryCount: number;
  onRetryCountChange: (v: number) => void;
  screenshotOnFailure: boolean;
  onScreenshotOnFailureChange: (v: boolean) => void;
  traceOnFailure: boolean;
  onTraceOnFailureChange: (v: boolean) => void;
  videoOnFailure: boolean;
  onVideoOnFailureChange: (v: boolean) => void;
  enableWebwright: boolean;
  onEnableWebwrightChange: (v: boolean) => void;
  webwrightEnabled: boolean;
  recommendedAgentsForDemo?: number;
}

const PARALLEL_OPTIONS = [1, 2, 3, 5, 10];
const RETRY_OPTIONS = [0, 1, 2];

export default function ExecutionConfigPanel({
  executionMode,
  onExecutionModeChange,
  allocationMode,
  onAllocationModeChange,
  headless,
  onHeadlessChange,
  parallelAgents,
  onParallelAgentsChange,
  retryCount,
  onRetryCountChange,
  screenshotOnFailure,
  onScreenshotOnFailureChange,
  traceOnFailure,
  onTraceOnFailureChange,
  videoOnFailure,
  onVideoOnFailureChange,
  enableWebwright,
  onEnableWebwrightChange,
  webwrightEnabled,
  recommendedAgentsForDemo,
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

      {/* Agent Allocation Mode */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Agent Allocation Mode</label>
        <div className="flex gap-2">
          {(
            [
              { value: 'auto', label: 'Auto (recommended)' },
              { value: 'manual', label: 'Manual' },
            ] as { value: AllocationMode; label: string }[]
          ).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => onAllocationModeChange(value)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                allocationMode === value
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {allocationMode === 'auto' ? (
          <div className="mt-2 space-y-1">
            <p className="text-xs text-gray-500">
              Auto mode adjusts agents based on test case count and available system resources.
            </p>
            {recommendedAgentsForDemo !== undefined && (
              <p className="text-xs text-blue-600">
                Recommended: {recommendedAgentsForDemo} agent(s) for demo mode. Agents will be
                selected automatically after the file is parsed.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-xs text-amber-600">
            Backend may reduce this value for safety based on system resources.
          </p>
        )}
      </div>

      {/* Parallel Agents — only shown in manual mode */}
      {allocationMode === 'manual' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Parallel Agents</label>
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
      )}

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
        </div>
      </div>

      {/* Evidence */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Evidence</p>
        {executionMode === 'generate-only' && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
            Screenshot, trace, and video capture are only available in{' '}
            <strong>Generate + Execute</strong> mode. These options are ignored in
            Generate Only mode.
          </p>
        )}
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

      {/* Webwright Repair */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Webwright Repair</p>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enableWebwright}
            disabled={executionMode !== 'generate-and-execute' || !webwrightEnabled}
            onChange={(e) => onEnableWebwrightChange(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 disabled:cursor-not-allowed"
          />
          <span className="text-sm text-gray-700">
            Enable Webwright Repair Mode
            <span className="block text-xs text-gray-400">
              Uses Webwright to debug failed executions, repair locators/assertions, and rerun tests. Slower but more accurate.
            </span>
          </span>
        </label>
        {executionMode !== 'generate-and-execute' && (
          <p className="mt-1 text-xs text-gray-400">Available only for Generate + Execute.</p>
        )}
        {executionMode === 'generate-and-execute' && !webwrightEnabled && (
          <p className="mt-1 text-xs text-gray-400">Webwright is disabled on this server.</p>
        )}
      </div>
    </div>
  );
}
