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
    const routePath = this.resolveRoutePath(url);
    const methods = locators
      .filter((locator) => !this.isPreconditionStep(locator.stepTarget))
      .map((l) => this.renderMethod(l))
      .join('\n\n');
    const outPath = path.join(outputDir, 'src', 'pages', `${className}.ts`);

    const content = `import { type Page } from '@playwright/test';
import { waitForPageLoad } from '../utils/wait.util';

export class ${className} {
  constructor(private readonly page: Page) {}

${methods}

  async goto(): Promise<void> {
    await this.page.goto(${this.renderStringLiteral(routePath)});
    await waitForPageLoad(this.page);
  }
}
`;

    FileUtils.ensureDir(path.dirname(outPath));
    FileUtils.writeFile(outPath, content);
    this.logger.info(`Page object generated: ${outPath}`);
    return outPath;
  }

  private renderMethod(locator: LocatorResult): string {
    const methodName = locator.methodName ?? StringUtils.toMethodName(locator.action, locator.stepTarget);
    const locatorExpr = this.renderLocatorExpression(locator.primaryLocator);

    switch (locator.action) {
      case 'enter':
        return `  async ${methodName}(value: string): Promise<void> {\n    await ${locatorExpr}.fill(value);\n  }`;
      case 'click':
        return `  async ${methodName}(): Promise<void> {\n    await ${locatorExpr}.click();\n  }`;
      case 'verifyVisible':
        return `  async ${methodName}(): Promise<void> {\n    await ${locatorExpr}.waitFor({ state: 'visible' });\n  }`;
      case 'verifyText':
        return `  async ${methodName}(): Promise<string> {\n    return (await ${locatorExpr}.innerText()).trim();\n  }`;
      case 'select':
        return `  async ${methodName}(value: string): Promise<void> {\n    await ${locatorExpr}.selectOption(value);\n  }`;
      case 'check':
        return `  async ${methodName}(): Promise<void> {\n    await ${locatorExpr}.check();\n  }`;
      case 'uncheck':
        return `  async ${methodName}(): Promise<void> {\n    await ${locatorExpr}.uncheck();\n  }`;
      default:
        return `  async ${methodName}(): Promise<void> {\n    await ${locatorExpr}.click();\n  }`;
    }
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

  private resolveRoutePath(url: string): string {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname?.trim() || '/';
      return pathname.startsWith('/') ? pathname : `/${pathname}`;
    } catch {
      return '/';
    }
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
