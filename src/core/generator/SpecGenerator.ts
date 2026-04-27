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
    const outPath = path.join(outputDir, 'tests', `${specName}.spec.ts`);
    const pageVarName = StringUtils.toCamelCase(pageName) + 'Page';

    const callLines: string[] = [];
    callLines.push(`await ${pageVarName}.goto();`);

    for (const [index, locator] of locators.entries()) {
      const methodName = StringUtils.toMethodName(locator.action, locator.stepTarget);
      const step = testCase.steps[index] ?? testCase.steps.find(s => s.target === locator.stepTarget);
      switch (locator.action) {
        case 'enter':
          callLines.push(`await ${pageVarName}.${methodName}(${this.renderStringLiteral(step?.value ?? '')});`);
          break;
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
}
