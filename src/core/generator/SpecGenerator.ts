import path from 'path';
import type { TestCase } from '../domain/TestCase.js';
import type { LocatorResult } from '../domain/LocatorResult.js';
import { StringUtils } from '../../utils/StringUtils.js';
import { FileUtils } from '../../utils/FileUtils.js';
import { Logger } from '../../utils/Logger.js';

export class SpecGenerator {
  private readonly logger = new Logger('SpecGenerator');

  generate(
    testCase: TestCase,
    pageName: string,
    url: string,
    locators: LocatorResult[],
    outputDir: string,
  ): string {
    const className = StringUtils.toPascalCase(pageName) + 'Page';
    const specName = StringUtils.toKebabCase(pageName);
    const outPath = path.join(outputDir, 'src', 'tests', `${specName}.spec.ts`);
    const dataPath = path.join(outputDir, 'src', 'test-data', `${specName}.data.json`);
    const pageVarName = StringUtils.toCamelCase(pageName) + 'Page';
    const dataVarName = StringUtils.toCamelCase(pageName) + 'Data';

    const callLines: string[] = [];
    callLines.push(`await ${pageVarName}.goto();`);

    const actionableLocators = locators.filter((locator, index) => {
      const step = testCase.steps[index] ?? testCase.steps.find((s) => s.target === locator.stepTarget);
      return !this.isPreconditionStep(step?.target ?? locator.stepTarget);
    });

    const testData = this.buildTestData(testCase, actionableLocators);
    FileUtils.ensureDir(path.dirname(dataPath));
    FileUtils.writeFile(dataPath, JSON.stringify(testData, null, 2));

    for (const [index, locator] of actionableLocators.entries()) {
      const methodName = locator.methodName ?? StringUtils.toMethodName(locator.action, locator.stepTarget);
      const step = testCase.steps[index] ?? testCase.steps.find(s => s.target === locator.stepTarget);
      switch (locator.action) {
        case 'enter': {
          const dataRef = this.resolveDataReference(step?.target, methodName, dataVarName);
          callLines.push(`await ${pageVarName}.${methodName}(${dataRef});`);
          break;
        }
        case 'verifyText': {
          const expected = step?.expected ?? this.resolveExpectedText(testCase, step?.target);
          if (expected) {
            callLines.push(`await ${pageVarName}.${methodName}(${this.renderStringLiteral(expected)});`);
          } else {
            callLines.push(`await ${pageVarName}.${methodName}(''); // TODO: provide expected text`);
          }
          break;
        }
        case 'verifyUrl': {
          const urlTarget = step?.expected ?? step?.target ?? '';
          callLines.push(...this.generateUrlAssertion(urlTarget, pageVarName));
          break;
        }
        case 'verifyVisible': {
          const expectedResult = step?.expected ?? this.resolveExpectedText(testCase, step?.target);
          callLines.push(...this.generateVisibilityAssertion(locator, pageVarName, methodName, expectedResult));
          break;
        }
        default:
          callLines.push(`await ${pageVarName}.${methodName}();`);
      }
    }

    // Add assertions from expectedResults not already covered by locators
    const uncoveredAssertions = this.buildUncoveredAssertions(testCase, locators, pageVarName);
    callLines.push(...uncoveredAssertions);

    const content = `import { test, expect } from '@playwright/test';
import { ${className} } from '../pages/${className}';
import ${dataVarName} from '../test-data/${specName}.data.json';

test(${this.renderStringLiteral(testCase.name)}, async ({ page }) => {
  const ${pageVarName} = new ${className}(page);

${callLines.map(l => `  ${l.trim()}`).join('\n')}
});
`;

    FileUtils.ensureDir(path.dirname(outPath));
    FileUtils.writeFile(outPath, content);
    this.logger.info(`Spec file generated: ${outPath}`);
    return outPath;
  }

  private renderStringLiteral(value: string): string {
    return JSON.stringify(value);
  }

  /** Generate inline URL assertion lines (no page object method needed). */
  private generateUrlAssertion(urlTarget: string, pageVarName: string): string[] {
    const clean = urlTarget.toLowerCase().trim();
    if (!clean) {
      return [
        `// TODO: add URL assertion for expected navigation`,
        `// await expect(${pageVarName}.page).toHaveURL(/.+/i);`,
      ];
    }
    // Extract keyword from URL-like string
    const keyword = clean.replace(/^https?:\/\/[^/]+/, '').replace(/[^a-z0-9]/g, '') || clean.replace(/[^a-z0-9]/g, '');
    if (keyword) {
      return [`await expect(page).toHaveURL(/${keyword}/i);`];
    }
    return [`await expect(page).toHaveURL(${this.renderStringLiteral(urlTarget)});`];
  }

  /** Generate visibility assertion, potentially upgrading to text assertion. */
  private generateVisibilityAssertion(
    locator: LocatorResult,
    pageVarName: string,
    methodName: string,
    expectedResult?: string,
  ): string[] {
    if (!expectedResult) {
      return [`await ${pageVarName}.${methodName}();`];
    }
    const lower = expectedResult.toLowerCase();
    // text-based assertions
    const containsMatch = /(?:contain|display|show|have)\s+(?:text\s+)?["']?([^"']+)["']?/i.exec(expectedResult);
    if (containsMatch) {
      return [`await ${pageVarName}.${methodName}(); // contains: ${containsMatch[1]}`];
    }
    if (lower.includes('error') || lower.includes('invalid') || lower.includes('fail')) {
      return [
        `await ${pageVarName}.${methodName}();`,
        `// Expect: ${expectedResult}`,
      ];
    }
    return [`await ${pageVarName}.${methodName}();`];
  }

  /** Build assertions from expectedResults that are not already covered by locators. */
  private buildUncoveredAssertions(
    testCase: TestCase,
    locators: LocatorResult[],
    pageVarName: string,
  ): string[] {
    const lines: string[] = [];
    // Only add uncovered URL-redirect expected results
    for (const er of testCase.expectedResults) {
      const lower = er.toLowerCase();
      const alreadyCovered = locators.some(l => l.action === 'verifyUrl');
      if (!alreadyCovered && /redirect|navigat|url|dashboard|home|page/i.test(lower)) {
        const keyword = lower.match(/\b(dashboard|home|login|cart|checkout|products)\b/)?.[1];
        if (keyword) {
          lines.push(`await expect(page).toHaveURL(/${keyword}/i); // Expected: ${er}`);
        }
      }
    }
    return lines;
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

  private buildTestData(testCase: TestCase, locators: LocatorResult[]): Record<string, unknown> {
    const validUser: Record<string, string> = {};
    const inputs: Record<string, string> = {};

    for (const [index, locator] of locators.entries()) {
      if (locator.action !== 'enter') continue;
      const step = testCase.steps[index] ?? testCase.steps.find((s) => s.target === locator.stepTarget);
      if (!step?.value) continue;

      const target = StringUtils.normalize(step.target);
      if (target.includes('email')) {
        validUser.email = step.value;
      } else if (target.includes('password')) {
        validUser.password = step.value;
      }

        const key = StringUtils.toCamelCase(
        (locator.methodName ?? StringUtils.toMethodName(locator.action, locator.stepTarget)).replace(/^enter/, ''),
      );
      inputs[key || `input${index + 1}`] = step.value;
    }

    const payload: Record<string, unknown> = {};
    if (Object.keys(validUser).length > 0) {
      payload.validUser = validUser;
    }
    payload.inputs = inputs;
    return payload;
  }

  private resolveDataReference(target: string | undefined, methodName: string, dataVarName: string): string {
    const normalized = StringUtils.normalize(target ?? '');
    if (normalized.includes('email')) return `${dataVarName}.validUser?.email ?? ''`;
    if (normalized.includes('password')) return `${dataVarName}.validUser?.password ?? ''`;

    const key = StringUtils.toCamelCase(methodName.replace(/^enter/, ''));
    return `${dataVarName}.inputs?.${key} ?? ''`;
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
