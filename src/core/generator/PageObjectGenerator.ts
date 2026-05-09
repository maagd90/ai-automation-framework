import path from 'path';
import type { LocatorResult } from '../domain/LocatorResult.js';
import type { LocatorCandidate } from '../domain/LocatorCandidate.js';
import { StringUtils } from '../../utils/StringUtils.js';
import { FileUtils } from '../../utils/FileUtils.js';
import { Logger } from '../../utils/Logger.js';

export interface GeneratedPageMethod {
  name: string;
  action: LocatorResult['action'];
  locatorStrategy: string;
  locatorField: string;
  locatorExpression: string;
  body: string;
}

export interface GeneratedPageModel {
  pageName: string;
  className: string;
  routePath: string;
  methods: GeneratedPageMethod[];
}

export class PageObjectGenerator {
  private readonly logger = new Logger('PageObjectGenerator');

  generate(
    pageName: string,
    url: string,
    locators: LocatorResult[],
    outputDir: string,
  ): { path: string; model: GeneratedPageModel } {
    const model = this.buildModel(pageName, url, locators);
    const outPath = path.join(outputDir, 'src', 'pages', `${model.className}.ts`);
    const content = this.render(model);

    FileUtils.ensureDir(path.dirname(outPath));
    FileUtils.writeFile(outPath, content);
    this.logger.info(`Page object generated: ${outPath}`);
    return { path: outPath, model };
  }

  buildModel(pageName: string, url: string, locators: LocatorResult[]): GeneratedPageModel {
    const className = StringUtils.toPascalCase(pageName) + 'Page';
    const routePath = this.resolveRoutePath(url);
    const methods = locators
      .filter((locator) => !this.isPreconditionStep(locator.stepTarget))
      .map((locator) => this.buildMethod(locator));

    return { pageName, className, routePath, methods };
  }

  render(model: GeneratedPageModel): string {
    const locatorFields = model.methods
      .map((method) => `  private readonly ${method.locatorField} = ${method.locatorExpression};`)
      .join('\n');
    const methods = model.methods.map((method) => method.body).join('\n\n');
    return `import { type Page } from '@playwright/test';
import { waitForPageLoad } from '../utils/wait.util';

export class ${model.className} {
  constructor(private readonly page: Page) {}

${locatorFields}

${methods}

  async goto(): Promise<void> {
    await this.page.goto(${this.renderStringLiteral(model.routePath)});
    await waitForPageLoad(this.page);
  }
}
`;
  }

  private buildMethod(locator: LocatorResult): GeneratedPageMethod {
    const name = locator.methodName ?? StringUtils.toMethodName(locator.action, locator.stepTarget);
    const locatorExpression = this.renderLocatorExpression(locator.primaryLocator);
    const locatorField = this.resolveLocatorFieldName(name);
    return {
      name,
      action: locator.action,
      locatorStrategy: locator.primaryLocator.strategy,
      locatorField,
      locatorExpression,
      body: this.renderMethod(name, locator.action, locatorField),
    };
  }

  private renderMethod(methodName: string, action: LocatorResult['action'], locatorField: string): string {
    switch (action) {
      case 'enter':
        return `  async ${methodName}(value: string): Promise<void> {\n    await this.${locatorField}.fill(value);\n  }`;
      case 'click':
        return `  async ${methodName}(): Promise<void> {\n    await this.${locatorField}.click();\n  }`;
      case 'verifyVisible':
        return `  async ${methodName}(): Promise<void> {\n    await this.${locatorField}.waitFor({ state: 'visible' });\n  }`;
      case 'verifyText':
        return `  async ${methodName}(): Promise<string> {\n    return (await this.${locatorField}.innerText()).trim();\n  }`;
      case 'select':
        return `  async ${methodName}(value: string): Promise<void> {\n    await this.${locatorField}.selectOption(value);\n  }`;
      case 'check':
        return `  async ${methodName}(): Promise<void> {\n    await this.${locatorField}.check();\n  }`;
      case 'uncheck':
        return `  async ${methodName}(): Promise<void> {\n    await this.${locatorField}.uncheck();\n  }`;
      default:
        return `  async ${methodName}(): Promise<void> {\n    await this.${locatorField}.click();\n  }`;
    }
  }

  private resolveLocatorFieldName(methodName: string): string {
    const stripped = methodName
      .replace(/^(enter|click|select|check|uncheck|verify|get|set)/i, '')
      .replace(/(Visible|Text|Value)$/i, '');
    return `${StringUtils.toCamelCase(stripped || methodName)}Locator`;
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
