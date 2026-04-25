import { z } from 'zod';
import type { TestCase } from '../domain/TestCase.js';
import type { TestCaseParser } from './TestCaseParser.js';

const ActionTypeSchema = z.enum([
  'enter', 'click', 'select', 'check', 'uncheck',
  'verifyText', 'verifyVisible', 'navigate',
]);

const TestStepSchema = z.object({
  order: z.number(),
  action: ActionTypeSchema,
  target: z.string(),
  value: z.string().optional(),
  expected: z.string().optional(),
});

const TestCaseSchema = z.object({
  name: z.string(),
  preconditions: z.array(z.string()).default([]),
  steps: z.array(TestStepSchema),
  expectedResults: z.array(z.string()).default([]),
});

export class JsonTestCaseParser implements TestCaseParser {
  parse(content: string): TestCase {
    const raw: unknown = JSON.parse(content);
    return TestCaseSchema.parse(raw);
  }
}
