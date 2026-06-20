import path from 'path';
import type { TestCase } from '../domain/TestCase.js';
import type { LocatorResult } from '../domain/LocatorResult.js';
import { StringUtils } from '../../utils/StringUtils.js';
import { FileUtils } from '../../utils/FileUtils.js';
import { Logger } from '../../utils/Logger.js';
import { SetupGenerator } from './SetupGenerator.js';

export class SpecGenerator {
  private readonly logger = new Logger('SpecGenerator');
  private readonly setupGen = new SetupGenerator();

  generate(
    testCase: TestCase,
    pageName: string,
    url: string,
    locators: LocatorResult[],
    outputDir: string,
  ): string {
    const className = StringUtils.toPascalCase(pageName) + 'Page';
    const specName = StringUtils.toKebabCase(pageName);
    const outPath = path.join(outputDir, 'tests', `${specName}.spec.ts`);
    const pageVarName = StringUtils.toCamelCase(pageName) + 'Page';

    const callLines: string[] = [];
    const firstStep = testCase.steps[0];
    const startsWithNavigate = firstStep?.action === 'navigate';

    if (!startsWithNavigate) {
      callLines.push(`await ${pageVarName}.goto();`);
    }

    for (const [index, locator] of locators.entries()) {
      const methodName = StringUtils.toMethodName(locator.action, locator.stepTarget);
      const step = testCase.steps[index] ?? testCase.steps.find(s => s.target === locator.stepTarget);
      switch (locator.action) {
        case 'enter':
          callLines.push(`await ${pageVarName}.${methodName}(${this.renderStringLiteral(step?.value ?? '')});`);
          break;
        case 'navigate':
          callLines.push(`await ${pageVarName}.${methodName}(${this.renderStringLiteral(step?.target ?? url)});`);
          break;
        case 'verifyText': {
          const expected = step?.value ?? step?.expected ?? this.resolveExpectedText(testCase, step?.target);
          if (expected) {
            callLines.push(`await ${pageVarName}.${methodName}(${this.renderStringLiteral(expected)});`);
          }
          break;
        }
        default:
          callLines.push(`await ${pageVarName}.${methodName}();`);
      }
    }

    const content = `import { test } from '@playwright/test';
import { ${className} } from '../pages/${className}';

${this.setupGen.renderDescribeWrapper(
  testCase,
  `test(${this.renderStringLiteral(testCase.name)}, async ({ page }) => {
  const ${pageVarName} = new ${className}(page);

${callLines.map(l => `    ${l.trim()}`).join('\n')}
  });`,
  testCase.id,
)}
`;

    FileUtils.ensureDir(path.dirname(outPath));
    FileUtils.writeFile(outPath, content);
    this.logger.info(`Spec file generated: ${outPath}`);
    return outPath;
  }

  private renderStringLiteral(value: string): string {
    return JSON.stringify(value);
  }

  private resolveExpectedText(testCase: TestCase, target?: string): string | undefined {
    if (!target) return testCase.expectedResults[0];

    const normalizedTarget = StringUtils.normalize(target);
    return (
      testCase.expectedResults.find((result) =>
        StringUtils.normalize(result).includes(normalizedTarget),
      ) ?? testCase.expectedResults[0]
    );
  }
}
