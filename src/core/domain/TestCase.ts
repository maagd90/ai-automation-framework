import type { TestStep } from './TestStep.js';

export interface TestCase {
  id?: string;
  name: string;
  preconditions: string[];
  steps: TestStep[];
  expectedResults: string[];
}
