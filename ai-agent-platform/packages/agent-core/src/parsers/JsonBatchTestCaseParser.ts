import type { TestCaseBatch, TestCase, TestStep } from '@ai-agent/shared-types';

/**
 * Parses a JSON file containing either:
 *  - A batch:  { batchName: string, testCases: TestCase[] }
 *  - A legacy single test case (any object with "steps" array)
 */
export class JsonBatchTestCaseParser {
  parse(content: string, filename: string): TestCaseBatch {
    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      throw new Error(`Invalid JSON in file "${filename}"`);
    }

    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`JSON root must be an object in "${filename}"`);
    }

    const obj = raw as Record<string, unknown>;

    // Batch format: { batchName, testCases }
    if (Array.isArray(obj['testCases'])) {
      const batchName = typeof obj['batchName'] === 'string' ? obj['batchName'] : filename;
      const testCases = (obj['testCases'] as unknown[]).map((tc, i) =>
        this.parseTestCase(tc, `testCases[${i}]`),
      );
      return { batchName, testCases };
    }

    // Legacy single test-case fallback
    const single = this.parseTestCase(raw, filename);
    return { batchName: single.name || filename, testCases: [single] };
  }

  private parseTestCase(raw: unknown, context: string): TestCase {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`Expected object at ${context}`);
    }
    const obj = raw as Record<string, unknown>;
    const id = typeof obj['id'] === 'string' ? obj['id'] : String(obj['id'] ?? context);
    const name = typeof obj['name'] === 'string' ? obj['name'] : id;
    const description = typeof obj['description'] === 'string' ? obj['description'] : undefined;
    const priority = ['high', 'medium', 'low'].includes(String(obj['priority']))
      ? (obj['priority'] as 'high' | 'medium' | 'low')
      : undefined;
    const preconditions = Array.isArray(obj['preconditions'])
      ? (obj['preconditions'] as unknown[]).filter(
          (item): item is string => typeof item === 'string',
        )
      : undefined;
    const expectedResults = Array.isArray(obj['expectedResults'])
      ? (obj['expectedResults'] as unknown[]).filter(
          (item): item is string => typeof item === 'string',
        )
      : undefined;

    if (!Array.isArray(obj['steps'])) {
      throw new Error(`"steps" must be an array at ${context}`);
    }
    const steps: TestStep[] = (obj['steps'] as unknown[]).map((s, i) =>
      this.parseStep(s, `${context}.steps[${i}]`),
    );
    return { id, name, description, priority, preconditions, steps, expectedResults };
  }

  private parseStep(raw: unknown, context: string): TestStep {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`Expected step object at ${context}`);
    }
    const s = raw as Record<string, unknown>;
    const order = typeof s['order'] === 'number' ? s['order'] : Number(s['order'] ?? 0);
    const action = typeof s['action'] === 'string' ? s['action'] : '';
    const description = typeof s['description'] === 'string' ? s['description'] : undefined;
    const target = typeof s['target'] === 'string' ? s['target'] : undefined;
    const value =
      typeof s['value'] === 'string'
        ? s['value']
        : typeof s['expected'] === 'string'
          ? s['expected']
          : undefined;
    const expected = typeof s['expected'] === 'string' ? s['expected'] : undefined;
    return { order, action, description, target, value, expected };
  }
}
