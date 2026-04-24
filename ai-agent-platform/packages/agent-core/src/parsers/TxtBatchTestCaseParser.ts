import type { TestCaseBatch, TestCase, TestStep } from '@ai-agent/shared-types';

/**
 * Parses a plain-text file containing one or more test cases delimited by:
 *
 *   TEST CASE START
 *   NAME: <name>
 *   ID: <id>               (optional)
 *   DESCRIPTION: <text>    (optional)
 *   STEP: <order>|<action>|<target>|<value>
 *   …
 *   TEST CASE END
 */
export class TxtBatchTestCaseParser {
  parse(content: string, filename: string): TestCaseBatch {
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
}
