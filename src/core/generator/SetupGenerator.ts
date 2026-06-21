import type { TestCase } from '../domain/TestCase.js';
import { StringUtils } from '../../utils/StringUtils.js';

export class SetupGenerator {
  renderPreconditionComments(testCase: TestCase): string[] {
    if (!testCase.preconditions.length) return [];
    return testCase.preconditions.map(
      (precondition) => `// Precondition: ${precondition}`,
    );
  }

  renderDescribeWrapper(testCase: TestCase, testBody: string, testCaseId?: string): string {
    const idLabel = testCaseId ? `${testCaseId}: ` : '';
    const lines = [
      `test.describe(${this.renderStringLiteral(`${idLabel}${testCase.name}`)}, () => {`,
      ...this.renderPreconditionComments(testCase).map((line) => `  ${line}`),
      `  ${testBody.trim()}`,
      `});`,
    ];
    return lines.join('\n');
  }

  private renderStringLiteral(value: string): string {
    return JSON.stringify(value);
  }
}
