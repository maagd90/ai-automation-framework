import type { TestCase } from '../domain/TestCase.js';
import type { TestStep } from '../domain/TestStep.js';
import type { TestCaseParser } from './TestCaseParser.js';
import { StepIntentAnalyzer } from '../intent/StepIntentAnalyzer.js';

export interface DetailedParseResult {
  testCase: TestCase;
  lowConfidenceSteps: Array<{ index: number; text: string }>;
  confidence: 'high' | 'low';
}

export class TxtTestCaseParser implements TestCaseParser {
  private readonly intentAnalyzer = new StepIntentAnalyzer();

  parse(content: string): TestCase {
    return this.parseDetailed(content).testCase;
  }

  parseDetailed(content: string): DetailedParseResult {
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);

    const name = this.extractAfterColon(lines, 'Test Case:') ?? 'Unnamed Test';
    const preconditions: string[] = [];
    const steps: TestStep[] = [];
    const expectedResults: string[] = [];
    const lowConfidenceSteps: Array<{ index: number; text: string }> = [];

    let section: 'none' | 'precondition' | 'steps' | 'expected' = 'none';

    for (const line of lines) {
      if (line.startsWith('Test Case:')) continue;

      if (line.startsWith('Precondition:') || line.startsWith('Preconditions:')) {
        section = 'precondition';
        const val = line.replace(/^Preconditions?:\s*/i, '').trim();
        if (val) preconditions.push(val);
        continue;
      }

      if (line.match(/^Steps?:/i)) {
        section = 'steps';
        continue;
      }

      if (line.match(/^Expected Results?:/i)) {
        section = 'expected';
        continue;
      }

      if (section === 'precondition') {
        preconditions.push(line);
      } else if (section === 'steps') {
        const stepMatch = line.match(/^(\d+)\.\s+(.+)$/);
        if (stepMatch) {
          const stepText = stepMatch[2];
          const { action, target, value, confidence } = this.intentAnalyzer.analyze(stepText);
          if (confidence === 'low') {
            lowConfidenceSteps.push({ index: steps.length, text: stepText });
          }
          steps.push({ order: Number(stepMatch[1]), action, target, value });
        }
      } else if (section === 'expected') {
        expectedResults.push(line);
      }
    }

    return {
      testCase: { name, preconditions, steps, expectedResults },
      lowConfidenceSteps,
      confidence: steps.length === 0 || lowConfidenceSteps.length > 0 ? 'low' : 'high',
    };
  }

  private extractAfterColon(lines: string[], prefix: string): string | undefined {
    const line = lines.find(l => l.startsWith(prefix));
    return line ? line.slice(prefix.length).trim() : undefined;
  }
}
