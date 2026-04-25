import type { TestCase } from '../domain/TestCase.js';

export interface TestCaseParser {
  parse(content: string): TestCase;
}
