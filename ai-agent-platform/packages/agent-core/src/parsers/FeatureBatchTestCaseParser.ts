import type { TestCaseBatch, TestCase, TestStep } from '@ai-agent/shared-types';

/**
 * Parses a Gherkin .feature file.
 *
 * - Each `Scenario:` or `Scenario Outline:` becomes one TestCase.
 * - `Background:` steps are prepended to every scenario.
 * - Steps (Given/When/Then/And/But) are mapped to TestStep with incrementing order.
 */
export class FeatureBatchTestCaseParser {
  parse(content: string, filename: string): TestCaseBatch {
    const lines = content.split(/\r?\n/);
    let featureName = filename;
    const backgroundSteps: TestStep[] = [];
    const testCases: TestCase[] = [];

    let inBackground = false;
    let inScenario = false;
    let currentSteps: TestStep[] = [];
    let currentName = '';
    let currentId = '';
    let stepOrder = 1;
    let autoId = 1;

    const STEP_KW = /^(Given|When|Then|And|But)\s+(.+)/i;

    const finalizeScenario = (): void => {
      if (inScenario && currentName) {
        testCases.push({
          id: currentId || `scenario-${autoId++}`,
          name: currentName,
          steps: [...backgroundSteps, ...currentSteps],
        });
      }
      currentSteps = [];
      currentName = '';
      currentId = '';
      stepOrder = backgroundSteps.length + 1;
    };

    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;

      if (/^Feature:/i.test(line)) {
        featureName = line.replace(/^Feature:\s*/i, '').trim();
        inBackground = false;
        inScenario = false;
        continue;
      }

      if (/^Background:/i.test(line)) {
        finalizeScenario();
        inBackground = true;
        inScenario = false;
        stepOrder = 1;
        continue;
      }

      if (/^Scenario(\s+Outline)?:/i.test(line)) {
        finalizeScenario();
        inBackground = false;
        inScenario = true;
        currentName = line.replace(/^Scenario(\s+Outline)?:\s*/i, '').trim();
        stepOrder = backgroundSteps.length + 1;
        continue;
      }

      const stepMatch = STEP_KW.exec(line);
      if (stepMatch) {
        const step: TestStep = {
          order: stepOrder++,
          action: `${stepMatch[1]} ${stepMatch[2]}`.trim(),
        };
        if (inBackground) {
          backgroundSteps.push(step);
        } else if (inScenario) {
          currentSteps.push(step);
        }
        continue;
      }
    }

    finalizeScenario();

    if (testCases.length === 0) {
      throw new Error(`No scenarios found in "${filename}".`);
    }

    return { batchName: featureName, testCases };
  }
}
