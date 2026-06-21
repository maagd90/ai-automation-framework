import type { TestCaseBatch } from '@ai-agent/shared-types';

/**
 * Derives the entry URL from a batch when the dashboard URL is omitted.
 * Uses the first navigate step target across all test cases.
 */
export function deriveUrlFromBatch(batch: TestCaseBatch): string | undefined {
  for (const testCase of batch.testCases) {
    const navigateStep = testCase.steps
      .slice()
      .sort((a, b) => a.order - b.order)
      .find((step) => step.action === 'navigate' && step.target?.trim());

    if (navigateStep?.target) {
      try {
        new URL(navigateStep.target);
        return navigateStep.target;
      } catch {
        continue;
      }
    }
  }
  return undefined;
}
