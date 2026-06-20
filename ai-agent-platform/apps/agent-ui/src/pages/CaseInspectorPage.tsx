import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftIcon, AlertCircleIcon } from 'lucide-react';
import { getCaseDetail } from '../api/jobs';
import type { TestStep } from '@ai-agent/shared-types';

function StepRow({ step, index }: { step: TestStep; index: number }) {
  const display = step.description
    ? step.description
    : [step.action, step.target, step.value ? `= ${step.value}` : '', step.expected ? `(expected: ${step.expected})` : '']
        .filter(Boolean)
        .join(' ');

  return (
    <tr className="border-t">
      <td className="px-3 py-2 text-xs text-gray-500">{step.order ?? index + 1}</td>
      <td className="px-3 py-2 text-sm font-mono">
        {display}
        {step.description && step.action && (
          <span className="ml-2 text-xs text-blue-600">→ {step.action}</span>
        )}
      </td>
    </tr>
  );
}

export default function CaseInspectorPage() {
  const { jobId, testCaseId } = useParams<{ jobId: string; testCaseId: string }>();

  const caseQuery = useQuery({
    queryKey: ['case-detail', jobId, testCaseId],
    queryFn: () => getCaseDetail(jobId!, testCaseId!),
    enabled: Boolean(jobId && testCaseId),
  });

  if (!jobId || !testCaseId) return null;

  const tc = caseQuery.data?.testCase;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to={`/jobs/${jobId}/result`}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-brand-600"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to results
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Case Inspector</h1>
        {caseQuery.data?.batchName && (
          <p className="text-sm text-gray-500 mt-1">{caseQuery.data.batchName}</p>
        )}
        <p className="text-sm text-gray-500 mt-1 font-mono">
          {testCaseId} · Job {jobId}
        </p>
      </div>

      {caseQuery.isPending && (
        <div className="text-center py-10 text-gray-400">Loading case details…</div>
      )}

      {caseQuery.isError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircleIcon className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Case details not available.</span>
        </div>
      )}

      {tc && (
        <div className="space-y-5">
          <section className="bg-white rounded-xl border shadow-sm p-5">
            <h2 className="text-base font-semibold text-gray-800 mb-3">Summary</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-gray-500">Name</dt>
                <dd className="font-medium">{tc.name}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Priority</dt>
                <dd className="font-medium">{tc.priority ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Generation</dt>
                <dd className="font-medium capitalize">{tc.generationStatus}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Execution</dt>
                <dd className="font-medium capitalize">{tc.executionStatus ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Duration</dt>
                <dd className="font-medium">{(tc.durationMs / 1000).toFixed(1)}s</dd>
              </div>
              {tc.error && (
                <div className="col-span-2">
                  <dt className="text-gray-500">Error</dt>
                  <dd className="font-medium text-red-600">{tc.error}</dd>
                </div>
              )}
            </dl>
          </section>

          {tc.inputSteps && tc.inputSteps.length > 0 && (
            <section className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <h2 className="text-base font-semibold text-gray-800 px-5 pt-5 pb-3">Input Steps</h2>
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2 w-16">#</th>
                    <th className="px-3 py-2">Step</th>
                  </tr>
                </thead>
                <tbody>
                  {tc.inputSteps.map((step, i) => (
                    <StepRow key={`${step.order}-${step.action}`} step={step} index={i} />
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {tc.repairAttempts && tc.repairAttempts.length > 0 && (
            <section className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <h2 className="text-base font-semibold text-gray-800 px-5 pt-5 pb-3">Repair Sidecar</h2>
              <div className="divide-y">
                {tc.repairAttempts.map((attempt) => (
                  <div key={`${attempt.attempt}-${attempt.failureType}`} className="px-5 py-3 text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">Attempt {attempt.attempt}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{attempt.failureType}</span>
                      {attempt.patched && (
                        <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">patched</span>
                      )}
                    </div>
                    <p className="text-gray-700">{attempt.suggestion}</p>
                    {attempt.diff && (
                      <p className="mt-1 text-xs font-mono text-gray-500">{attempt.diff}</p>
                    )}
                    {attempt.filesChanged.length > 0 && (
                      <p className="mt-1 text-xs text-gray-500">Files: {attempt.filesChanged.join(', ')}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {tc.steps.length > 0 && (
            <section className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <h2 className="text-base font-semibold text-gray-800 px-5 pt-5 pb-3">Execution Steps</h2>
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2 w-16">#</th>
                    <th className="px-3 py-2">Step</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tc.steps.map((step) => (
                    <tr key={step.order} className="border-t">
                      <td className="px-3 py-2 text-xs text-gray-500">{step.order}</td>
                      <td className="px-3 py-2 text-sm font-mono">
                        {[step.action, step.target].filter(Boolean).join(' ')}
                      </td>
                      <td className="px-3 py-2 text-sm capitalize">{step.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
