import type { TestStep } from './TestStep.js';

export interface TestCase {
  name: string;
  feature?: string;
  module?: string;
  category?: string;
  preconditions: string[];
  steps: TestStep[];
  expectedResults: string[];
}
