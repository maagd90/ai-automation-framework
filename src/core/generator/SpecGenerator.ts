import path from 'path';
import type { TestCase } from '../domain/TestCase.js';
import type { LocatorResult } from '../domain/LocatorResult.js';
import { StringUtils } from '../../utils/StringUtils.js';
import { FileUtils } from '../../utils/FileUtils.js';
import { Logger } from '../../utils/Logger.js';
import { TestDataModelBuilder } from './TestDataModelBuilder.js';

export interface GeneratedSpecModel {
  specName: string;
  dataVarName: string;
  pageVarName: string;
  className: string;
  title: string;
  dataReferences: string[];
  assertionLines: string[];
  testBody: string;
  fileContent: string;
  testData: Record<string, unknown>;
}

export class SpecGenerator {
  private readonly logger = new Logger('SpecGenerator');
  private readonly testDataBuilder = new TestDataModelBuilder();

  generate(
    testCase: TestCase,
    pageName: string,
    url: string,
    locators: LocatorResult[],
    outputDir: string,
  ): { path: string; dataPath: string; model: GeneratedSpecModel } {
    const model = this.buildModel(testCase, pageName, url, locators);
    const outPath = path.join(outputDir, 'src', 'tests', `${model.specName}.spec.ts`);
    const dataPath = path.join(outputDir, 'src', 'test-data', `${model.specName}.data.json`);

    FileUtils.ensureDir(path.dirname(dataPath));
    FileUtils.writeFile(dataPath, JSON.stringify(model.testData, null, 2));
    FileUtils.ensureDir(path.dirname(outPath));
    FileUtils.writeFile(outPath, model.fileContent);
    this.logger.info(`Spec file generated: ${outPath}`);
    return { path: outPath, dataPath, model };
  }

  buildModel(
    testCase: TestCase,
    pageName: string,
    _url: string,
    locators: LocatorResult[],
  ): GeneratedSpecModel {
    const className = StringUtils.toPascalCase(pageName) + 'Page';
    const specName = StringUtils.toKebabCase(pageName);
    const pageVarName = StringUtils.toCamelCase(pageName) + 'Page';
    const dataVarName = StringUtils.toCamelCase(pageName) + 'Data';

    const callLines: string[] = [];
    callLines.push(`await ${pageVarName}.goto();`);

    const actionableLocators = locators.filter((locator) => {
      const step = testCase.steps.find((candidate) => candidate.order === locator.stepOrder);
      return !this.isPreconditionStep(step?.target ?? locator.stepTarget);
    });

    const dataModel = this.testDataBuilder.build(testCase, actionableLocators);
    const dataReferences: string[] = [];

    for (const locator of actionableLocators) {
      const methodName = locator.methodName ?? StringUtils.toMethodName(locator.action, locator.stepTarget);
      const step = testCase.steps.find((candidate) => candidate.order === locator.stepOrder);
      switch (locator.action) {
        case 'enter': {
          const referencePath = dataModel.referencesByStepOrder.get(locator.stepOrder);
          const dataRef = referencePath
            ? this.testDataBuilder.toExpression(referencePath, dataVarName)
            : JSON.stringify(step?.value ?? '');
          if (referencePath) dataReferences.push(referencePath);
          callLines.push(`await ${pageVarName}.${methodName}(${dataRef});`);
          break;
        }
        case 'select': {
          const referencePath = dataModel.referencesByStepOrder.get(locator.stepOrder);
          const dataRef = referencePath
            ? this.testDataBuilder.toExpression(referencePath, dataVarName)
            : JSON.stringify(step?.value ?? '');
          if (referencePath) dataReferences.push(referencePath);
          callLines.push(`await ${pageVarName}.${methodName}(${dataRef});`);
          break;
        }
        case 'verifyText': {
          callLines.push(`await ${pageVarName}.${methodName}();`);
          break;
        }
        default:
          callLines.push(`await ${pageVarName}.${methodName}();`);
      }
    }

    const assertionLines = this.buildAssertionLines(testCase.expectedResults);

    const testBody = `test(${this.renderStringLiteral(testCase.name)}, async ({ page }) => {
  const ${pageVarName} = new ${className}(page);

${callLines.map(l => `  ${l.trim()}`).join('\n')}

${assertionLines.map(l => `  ${l.trim()}`).join('\n')}
});`;

    const content = `import { test, expect } from '@playwright/test';
import { ${className} } from '../pages/${className}';
import ${dataVarName} from '../test-data/${specName}.data.json';

${testBody}
`;
    return {
      specName,
      dataVarName,
      pageVarName,
      className,
      title: testCase.name,
      dataReferences,
      assertionLines,
      testBody,
      fileContent: content,
      testData: dataModel.data,
    };
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

  private buildAssertionLines(expectedResults: string[]): string[] {
    if (expectedResults.length === 0) {
      return ["await expect(page).not.toHaveURL(/login/i);"];
    }

    const lines: string[] = [];
    for (const result of expectedResults) {
      const normalized = StringUtils.normalize(result);

      if (normalized.includes('dashboard')) {
        lines.push('await expect(page).toHaveURL(/dashboard/i);');
        lines.push("await expect(page.getByText('Dashboard')).toBeVisible();");
        continue;
      }

      if (normalized.includes('visible')) {
        const textMatch = result.match(/([A-Za-z0-9_-]+)\s+(?:should\s+be\s+)?visible/i);
        const textValue = textMatch?.[1] ?? result;
        lines.push(`await expect(page.getByText(${this.renderStringLiteral(textValue)})).toBeVisible();`);
        continue;
      }

      if (normalized.includes('redirect') && normalized.includes('login')) {
        lines.push('await expect(page).toHaveURL(/login/i);');
        continue;
      }

      if (normalized.includes('redirect')) {
        const candidate = normalized.split('redirect')[1]?.trim();
        if (candidate) {
          lines.push(`await expect(page).toHaveURL(/${candidate.replace(/\s+/g, '|')}/i);`);
          continue;
        }
      }

      lines.push('await expect(page).not.toHaveURL(/login/i);');
    }

    return lines.length > 0 ? lines : ['await expect(page).not.toHaveURL(/login/i);'];
  }

  private isPreconditionStep(stepText: string): boolean {
    const normalized = StringUtils.normalize(stepText);
    return (
      normalized.startsWith('user is on')
      || normalized.startsWith('user is on the')
      || normalized.startsWith('navigate to')
      || normalized.includes(' navigate to ')
      || normalized.startsWith('open ')
      || normalized.includes(' open ')
      || (normalized.includes('page') && normalized.includes('is on'))
    );
  }
}
