import type { TestCase } from '../domain/TestCase.js';
import type { TestStep } from '../domain/TestStep.js';
import type { TestCaseParser } from './TestCaseParser.js';
import { StepIntentAnalyzer } from '../intent/StepIntentAnalyzer.js';

export class GherkinTestCaseParser implements TestCaseParser {
  private readonly intentAnalyzer = new StepIntentAnalyzer();

  parse(content: string): TestCase {
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);

    const featureLine = lines.find(l => l.startsWith('Feature:'));
    const scenarioLine = lines.find(l => l.startsWith('Scenario:'));
    const name = scenarioLine
      ? scenarioLine.replace('Scenario:', '').trim()
      : featureLine?.replace('Feature:', '').trim() ?? 'Unnamed Test';

    const preconditions: string[] = [];
    const steps: TestStep[] = [];
    const expectedResults: string[] = [];
    let order = 1;

    for (const line of lines) {
      if (line.startsWith('Feature:') || line.startsWith('Scenario:')) continue;

      const stepMatch = line.match(/^(Given|When|Then|And|But)\s+(.+)$/i);
      if (stepMatch) {
        const keyword = stepMatch[1].toLowerCase();
        const text = stepMatch[2];

        if (keyword === 'given') {
          preconditions.push(text);
        } else if (keyword === 'then') {
          const { action, target, value } = this.intentAnalyzer.analyze(text);
          steps.push({ order: order++, action, target, value });
          expectedResults.push(text);
        } else {
          const { action, target, value } = this.intentAnalyzer.analyze(text);
          steps.push({ order: order++, action, target, value });
        }
      }
    }

    return { name, preconditions, steps, expectedResults };
  }
}
