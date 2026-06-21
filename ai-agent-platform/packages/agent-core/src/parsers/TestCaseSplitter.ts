import fs from 'fs';
import path from 'path';
import type { TestCase, TestCaseBatch } from '@ai-agent/shared-types';

export interface SplitResult {
  childId: string;
  filePath?: string;
  content?: string;
  testCase: TestCase;
}

interface RootCliTestCase {
  id?: string;
  name: string;
  preconditions: string[];
  steps: Array<{
    order: number;
    action: string;
    target: string;
    value?: string;
  }>;
  expectedResults: string[];
}

/**
 * Writes each TestCase in a batch to an isolated child JSON file.
 *
 * Layout:  <outputDir>/child-<NNNN>.json
 */
export class TestCaseSplitter {
  split(batch: TestCaseBatch, outputDir?: string): SplitResult[] {
    if (outputDir) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    return batch.testCases.map((tc, idx) => {
      const childId = `child-${String(idx + 1).padStart(4, '0')}`;
      const payload = this.toRootCliTestCase(tc);
      const content = JSON.stringify(payload, null, 2);
      if (outputDir) {
        const filePath = path.join(outputDir, `${childId}.json`);
        fs.writeFileSync(filePath, content, 'utf8');
        return { childId, filePath, content, testCase: tc };
      }
      return { childId, content, testCase: tc };
    });
  }

  private toRootCliTestCase(testCase: TestCase): RootCliTestCase {
    return {
      id: testCase.id,
      name: testCase.name,
      preconditions: testCase.preconditions ?? [],
      steps: testCase.steps.map((step) => ({
        order: step.order,
        action: step.action,
        target: step.target ?? '',
        ...(step.value !== undefined ? { value: step.value } : {}),
        ...(step.expected !== undefined ? { expected: step.expected } : {}),
      })),
      expectedResults: testCase.expectedResults ?? [],
    };
  }
}
