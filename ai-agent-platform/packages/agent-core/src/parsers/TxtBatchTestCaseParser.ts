import type { TestCaseBatch, TestCase, TestStep } from '@ai-agent/shared-types';
import { StepNormalizer } from './StepNormalizer';

/**
 * Parses plain-text batch files in two formats:
 *
 * 1. Structured blocks (TEST CASE START / STEP: order|action|target|value)
 * 2. Natural language (Test Case: / Steps: / numbered lines — login-test.txt style)
 */
export class TxtBatchTestCaseParser {
  private readonly normalizer = new StepNormalizer();

  parse(content: string, filename: string): TestCaseBatch {
    if (/TEST CASE START/i.test(content)) {
      return this.parseStructuredBlocks(content, filename);
    }
    return this.parseNaturalLanguage(content, filename);
  }

  private parseStructuredBlocks(content: string, filename: string): TestCaseBatch {
    const lines = content.split(/\r?\n/);
    const testCases: TestCase[] = [];
    let inBlock = false;
    let current: Partial<TestCase> & { steps: TestStep[] } | null = null;
    let autoId = 1;

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;

      if (line.toUpperCase() === 'TEST CASE START') {
        inBlock = true;
        current = { steps: [] };
        continue;
      }

      if (line.toUpperCase() === 'TEST CASE END') {
        if (current) {
          const id = current.id ?? `tc-${autoId++}`;
          testCases.push({
            id,
            name: current.name ?? id,
            description: current.description,
            steps: current.steps,
          });
        }
        inBlock = false;
        current = null;
        continue;
      }

      if (!inBlock || !current) continue;

      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim().toUpperCase();
      const val = line.slice(colonIdx + 1).trim();

      switch (key) {
        case 'ID':
          current.id = val;
          break;
        case 'NAME':
          current.name = val;
          break;
        case 'DESCRIPTION':
          current.description = val;
          break;
        case 'STEP': {
          const parts = val.split('|').map((p) => p.trim());
          const order = parseInt(parts[0] ?? '0', 10);
          const action = parts[1] ?? '';
          const target = parts[2] || undefined;
          const value = parts[3] || undefined;
          current.steps.push({ order, action, target, value });
          break;
        }
        default:
          break;
      }
    }

    if (testCases.length === 0) {
      throw new Error(`No test cases found in "${filename}". Ensure blocks use TEST CASE START / TEST CASE END.`);
    }

    return { batchName: filename, testCases };
  }

  private parseNaturalLanguage(content: string, filename: string): TestCaseBatch {
    const lines = content.split(/\r?\n/);
    const testCases: TestCase[] = [];
    let current: Partial<TestCase> & { steps: TestStep[] } | null = null;
    let section: 'none' | 'precondition' | 'steps' | 'expected' = 'none';
    let autoId = 1;

    const finalizeCase = (): void => {
      if (!current || current.steps.length === 0) return;
      const id = current.id ?? `TC-${String(autoId++).padStart(3, '0')}`;
      testCases.push({
        id,
        name: current.name ?? id,
        description: current.description,
        preconditions: current.preconditions,
        steps: current.steps,
        expectedResults: current.expectedResults,
      });
      current = null;
      section = 'none';
    };

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;

      if (/^Test Case:/i.test(line)) {
        finalizeCase();
        current = { steps: [], preconditions: [], expectedResults: [] };
        current.name = line.replace(/^Test Case:\s*/i, '').trim();
        current.id = `TC-${String(autoId).padStart(3, '0')}`;
        continue;
      }

      if (!current) continue;

      if (/^Preconditions?:/i.test(line)) {
        section = 'precondition';
        const val = line.replace(/^Preconditions?:\s*/i, '').trim();
        if (val) current.preconditions!.push(val);
        continue;
      }

      if (/^Steps?:/i.test(line)) {
        section = 'steps';
        continue;
      }

      if (/^Expected Results?:/i.test(line)) {
        section = 'expected';
        continue;
      }

      if (section === 'precondition') {
        current.preconditions!.push(line);
      } else if (section === 'steps') {
        const stepMatch = line.match(/^(\d+)\.\s+(.+)$/);
        if (stepMatch) {
          const stepText = stepMatch[2];
          const intent = this.normalizer.analyze(stepText);
          current.steps.push({
            order: Number(stepMatch[1]),
            action: intent.action,
            target: intent.target,
            value: intent.value,
            description: stepText,
          });
        }
      } else if (section === 'expected') {
        current.expectedResults!.push(line);
      }
    }

    finalizeCase();

    if (testCases.length === 0) {
      throw new Error(
        `No test cases found in "${filename}". Use "Test Case:" headers or TEST CASE START blocks.`,
      );
    }

    return { batchName: filename, testCases };
  }
}
