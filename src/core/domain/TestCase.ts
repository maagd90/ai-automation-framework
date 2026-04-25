import type { TestStep } from './TestStep.js';

export interface TestCase {
  name: string;
  preconditions: string[];
  steps: TestStep[];
  expectedResults: string[];
}
