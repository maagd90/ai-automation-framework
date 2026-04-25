import { z } from 'zod';
import type { TestCase } from '../domain/TestCase.js';
import type { TestCaseParser } from './TestCaseParser.js';
import { StepIntentAnalyzer } from '../intent/StepIntentAnalyzer.js';

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

const VALID_ACTIONS = new Set(ActionTypeSchema.options);

interface StepLike {
  order?: number;
  action?: unknown;
  target?: unknown;
  value?: unknown;
  expected?: unknown;
}

function stripGherkinKeyword(text: string): { keyword: string; body: string } {
  const m = text.match(/^(Given|When|Then|And|But)\s+(.+)$/i);
  if (!m) {
    return { keyword: '', body: text.trim() };
  }
  return { keyword: m[1].toLowerCase(), body: m[2].trim() };
}

export class JsonTestCaseParser implements TestCaseParser {
  private readonly intentAnalyzer = new StepIntentAnalyzer();

  private normalizeStep(step: unknown, index: number): StepLike {
    const fallbackOrder = index + 1;

    if (typeof step === 'string') {
      const { keyword, body } = stripGherkinKeyword(step);
      const intent = this.intentAnalyzer.analyze(body);
      const normalized: StepLike = {
        order: fallbackOrder,
        action: intent.action,
        target: intent.target,
      };
      if (intent.value !== undefined) normalized.value = intent.value;
      if (keyword === 'then') normalized.expected = body;
      return normalized;
    }

    if (!step || typeof step !== 'object') {
      return { order: fallbackOrder, action: 'click', target: String(step ?? '') };
    }

    const stepObj = step as StepLike;
    const order = typeof stepObj.order === 'number' ? stepObj.order : fallbackOrder;

    if (typeof stepObj.action === 'string' && VALID_ACTIONS.has(stepObj.action as z.infer<typeof ActionTypeSchema>)) {
      return { ...stepObj, order };
    }

    const gherkinText = typeof stepObj.action === 'string'
      ? stepObj.action
      : typeof stepObj.target === 'string'
        ? stepObj.target
        : '';

    if (gherkinText) {
      const { keyword, body } = stripGherkinKeyword(gherkinText);
      const intent = this.intentAnalyzer.analyze(body);
      const normalized: StepLike = {
        ...stepObj,
        order,
        action: intent.action,
        target: typeof stepObj.target === 'string' && stepObj.target.trim().length > 0
          ? stepObj.target
          : intent.target,
      };
      if (typeof stepObj.value !== 'string' && intent.value !== undefined) {
        normalized.value = intent.value;
      }
      if (keyword === 'then' && typeof stepObj.expected !== 'string') {
        normalized.expected = body;
      }
      return normalized;
    }

    return { ...stepObj, order };
  }

  private normalizeRaw(raw: unknown): unknown {
    if (!raw || typeof raw !== 'object') {
      return raw;
    }

    const base = raw as { steps?: unknown[] };
    if (!Array.isArray(base.steps)) {
      return raw;
    }

    return {
      ...base,
      steps: base.steps.map((step, idx) => this.normalizeStep(step, idx)),
    };
  }

  parse(content: string): TestCase {
    const raw: unknown = JSON.parse(content);
    const normalized = this.normalizeRaw(raw);
    return TestCaseSchema.parse(normalized);
  }
}
