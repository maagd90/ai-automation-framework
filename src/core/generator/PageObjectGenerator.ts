import path from 'path';
import type { LocatorResult } from '../domain/LocatorResult.js';
import type { LocatorCandidate } from '../domain/LocatorCandidate.js';
import { StringUtils } from '../../utils/StringUtils.js';
import { FileUtils } from '../../utils/FileUtils.js';
import { Logger } from '../../utils/Logger.js';

export class PageObjectGenerator {
  private readonly logger = new Logger('PageObjectGenerator');

  generate(pageName: string, url: string, locators: LocatorResult[], outputDir: string): string {
    const className = StringUtils.toPascalCase(pageName) + 'Page';
    const methods = locators.map(l => this.renderMethod(l)).join('\n\n');
    const outPath = path.join(outputDir, 'pages', `${className}.ts`);

    const content = `import { type Page, expect } from '@playwright/test';

export class ${className} {
  constructor(private readonly page: Page) {}

${methods}

  async goto(): Promise<void> {
    await this.page.goto(${this.renderStringLiteral(url)});
    await this.page.waitForLoadState('networkidle');
  }
}
`;

    FileUtils.ensureDir(path.dirname(outPath));
    FileUtils.writeFile(outPath, content);
    this.logger.info(`Page object generated: ${outPath}`);
    return outPath;
  }

  private renderMethod(locator: LocatorResult): string {
    const methodName = StringUtils.toMethodName(locator.action, locator.stepTarget);

    if (locator.action === 'navigate') {
      return `  async ${methodName}(url: string): Promise<void> {\n    await this.page.goto(url);\n    await this.page.waitForLoadState('networkidle');\n  }`;
    }

    const expressions = [
      this.renderLocatorExpression(locator.primaryLocator),
      ...locator.fallbackLocators.map((candidate) => this.renderLocatorExpression(candidate)),
    ];

    return this.renderActionWithFallbacks(methodName, locator.action, expressions);
  }

  private renderActionWithFallbacks(
    methodName: string,
    action: string,
    expressions: string[],
  ): string {
    const renderAttempt = (expr: string): string => {
      switch (action) {
        case 'enter':
          return `await ${expr}.fill(value)`;
        case 'select':
          return `await ${expr}.selectOption(value)`;
        case 'verifyVisible':
          return `await expect(${expr}).toBeVisible()`;
        case 'verifyText':
          return `await expect(${expr}).toHaveText(expected)`;
        case 'check':
          return `await ${expr}.check()`;
        case 'uncheck':
          return `await ${expr}.uncheck()`;
        default:
          return `await ${expr}.click()`;
      }
    };

    const hasValueParam = action === 'enter' || action === 'select';
    const hasExpectedParam = action === 'verifyText';
    const params = [
      ...(hasValueParam ? ['value: string'] : []),
      ...(hasExpectedParam ? ['expected: string'] : []),
    ].join(', ');
    const paramSuffix = params ? `(${params})` : '()';

    if (expressions.length <= 1) {
      const body = renderAttempt(expressions[0]);
      return `  async ${methodName}${paramSuffix}: Promise<void> {\n    ${body};\n  }`;
    }

    const attempts = expressions
      .map((expr, index) => {
        const attempt = `      ${renderAttempt(expr)};`;
        return index === 0 ? `    try {\n${attempt}` : `    } catch {\n    try {\n${attempt}`;
      })
      .join('\n');
    const closing = `${'    } catch {\n'.repeat(expressions.length - 1)}      throw new Error('All locator fallbacks failed for ${methodName}');\n${'    }\n'.repeat(expressions.length)}`;

    return `  async ${methodName}${paramSuffix}: Promise<void> {\n${attempts}\n${closing}  }`;
  }

  private renderLocatorExpression(candidate: LocatorCandidate): string {
    switch (candidate.strategy) {
      case 'getByTestId':
        return `this.page.getByTestId(${this.renderStringLiteral(candidate.value)})`;
      case 'getByLabel':
        return `this.page.getByLabel(${this.renderStringLiteral(candidate.value)})`;
      case 'getByPlaceholder':
        return `this.page.getByPlaceholder(${this.renderStringLiteral(candidate.value)})`;
      case 'getByText':
        return `this.page.getByText(${this.renderStringLiteral(candidate.value)})`;
      case 'getByRole': {
        const roleCandidate = this.parseRoleCandidate(candidate.value);
        if (!roleCandidate) {
          return `this.page.getByRole(${this.renderStringLiteral(candidate.value)})`;
        }
        return roleCandidate.name
          ? `this.page.getByRole(${this.renderStringLiteral(roleCandidate.role)}, { name: ${this.renderStringLiteral(roleCandidate.name)} })`
          : `this.page.getByRole(${this.renderStringLiteral(roleCandidate.role)})`;
      }
      default:
        return `this.page.locator(${this.renderStringLiteral(candidate.value)})`;
    }
  }

  private renderStringLiteral(value: string): string {
    return JSON.stringify(value);
  }

  private parseRoleCandidate(value: string): { role: string; name?: string } | null {
    try {
      const parsed = JSON.parse(value) as { role?: string; name?: string };
      return parsed.role ? { role: parsed.role, name: parsed.name } : null;
    } catch {
      const match = value.match(/^(\w+),\s*\{\s*name:\s*'([^']+)'\s*\}$/);
      return match ? { role: match[1], name: match[2] } : null;
    }
  }
}
