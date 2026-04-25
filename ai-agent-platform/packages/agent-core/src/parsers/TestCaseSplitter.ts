import fs from 'fs';
import path from 'path';
import type { TestCase, TestCaseBatch } from '@ai-agent/shared-types';

export interface SplitResult {
  childId: string;
  filePath: string;
  testCase: TestCase;
}

/**
 * Writes each TestCase in a batch to an isolated child JSON file.
 *
 * Layout:  <outputDir>/child-<NNNN>.json
 */
export class TestCaseSplitter {
  split(batch: TestCaseBatch, outputDir: string): SplitResult[] {
    fs.mkdirSync(outputDir, { recursive: true });
    return batch.testCases.map((tc, idx) => {
      const childId = `child-${String(idx + 1).padStart(4, '0')}`;
      const filePath = path.join(outputDir, `${childId}.json`);
      const payload = this.toRootCliTestCase(tc);
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
      return { childId, filePath, testCase: tc };
    });
  }

  private toRootCliTestCase(testCase: TestCase): {
    name: string;
    preconditions: string[];
    steps: Array<{
      order: number;
      action: string;
      target: string;
      value?: string;
    }>;
    expectedResults: string[];
  } {
    const maybeRootCompatible = testCase as TestCase & {
      preconditions?: string[];
      expectedResults?: string[];
    };

    return {
      name: testCase.name,
      preconditions: maybeRootCompatible.preconditions ?? [],
      steps: testCase.steps.map((step) => ({
        order: step.order,
        action: step.action,
        target: step.target ?? '',
        ...(step.value !== undefined ? { value: step.value } : {}),
      })),
      expectedResults: maybeRootCompatible.expectedResults ?? [],
    };
  }
}
