import type { ExcelPreviewResponse, ExcelPreviewRow } from '@ai-agent/shared-types';
import { AlertTriangleIcon, CheckCircleIcon } from 'lucide-react';

interface ExcelPreviewTableProps {
  preview: ExcelPreviewResponse;
  onProceed: () => void;
  onCancel: () => void;
  isPending?: boolean;
}

function ConfidenceBadge({ confidence, source }: { confidence: number; source: ExcelPreviewRow['source'] }) {
  const pct = Math.round(confidence * 100);
  let bg = 'bg-green-100 text-green-700';
  if (confidence < 0.70) bg = 'bg-red-100 text-red-700';
  else if (confidence < 0.85) bg = 'bg-yellow-100 text-yellow-700';

  const sourceLabel = source === 'explicit-column' ? 'column' : source === 'nlp-rule' ? 'nlp' : 'ai';

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${bg}`}>
      {pct}% <span className="opacity-60">({sourceLabel})</span>
    </span>
  );
}

export default function ExcelPreviewTable({ preview, onProceed, onCancel, isPending }: ExcelPreviewTableProps) {
  const hasLowConfidence = preview.lowConfidenceCount > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Excel Preview</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            File: <span className="font-medium">{preview.filename}</span> &mdash;{' '}
            {preview.totalSteps} step{preview.totalSteps !== 1 ? 's' : ''}
          </p>
        </div>
        {hasLowConfidence && (
          <div className="flex items-center gap-1.5 text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-1.5">
            <AlertTriangleIcon className="w-4 h-4 shrink-0" />
            <span>
              {preview.lowConfidenceCount} low-confidence step{preview.lowConfidenceCount !== 1 ? 's' : ''}.
              Review before generating.
            </span>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-xs text-left">
          <thead className="bg-gray-50 text-gray-500 uppercase tracking-wide text-[10px]">
            <tr>
              <th className="px-3 py-2 whitespace-nowrap">TC ID</th>
              <th className="px-3 py-2 whitespace-nowrap">TC Name</th>
              <th className="px-3 py-2 whitespace-nowrap">Step</th>
              <th className="px-3 py-2">Original Step</th>
              <th className="px-3 py-2 whitespace-nowrap">Action</th>
              <th className="px-3 py-2">Target</th>
              <th className="px-3 py-2">Value</th>
              <th className="px-3 py-2">Expected</th>
              <th className="px-3 py-2 whitespace-nowrap">Confidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {preview.rows.map((row, idx) => {
              const isLow = row.confidence < 0.70;
              return (
                <tr
                  key={idx}
                  className={isLow ? 'bg-red-50' : 'bg-white hover:bg-gray-50'}
                >
                  <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap">{row.testCaseId}</td>
                  <td className="px-3 py-2 text-gray-700 max-w-[120px] truncate" title={row.testCaseName}>{row.testCaseName}</td>
                  <td className="px-3 py-2 text-center text-gray-500">{row.stepNo}</td>
                  <td className="px-3 py-2 text-gray-600 max-w-[160px] truncate" title={row.originalStep}>{row.originalStep}</td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded text-[10px]">{row.detectedAction}</span>
                  </td>
                  <td className="px-3 py-2 text-gray-700 max-w-[120px] truncate" title={row.target}>{row.target}</td>
                  <td className="px-3 py-2 text-gray-500 max-w-[100px] truncate" title={row.value}>{row.value}</td>
                  <td className="px-3 py-2 text-gray-500 max-w-[120px] truncate" title={row.expected}>{row.expected}</td>
                  <td className="px-3 py-2">
                    <ConfidenceBadge confidence={row.confidence} source={row.source} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onProceed}
          disabled={isPending}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
        >
          <CheckCircleIcon className="w-4 h-4" />
          {isPending ? 'Creating job…' : 'Proceed to Generation'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors px-3 py-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
