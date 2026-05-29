import fs from 'fs';
import path from 'path';
import type { WebwrightAssertionSuggestion, WebwrightLocatorSuggestion } from './WebwrightResultParser';
import type { WebwrightValidationResult } from './WebwrightSuggestionValidator';

export interface WebwrightPatchResult {
  patchedFiles: string[];
  recommendationsUsed: number;
  warnings: string[];
}

function toKebab(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function toCamel(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  return normalized
    .map((token, index) =>
      index === 0 ? token.charAt(0).toLowerCase() + token.slice(1) : token.charAt(0).toUpperCase() + token.slice(1),
    )
    .join('');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderLocatorExpression(locator: WebwrightLocatorSuggestion): string {
  if (locator.selector.startsWith('page.')) {
    return `this.${locator.selector}`;
  }
  if (locator.selector.startsWith('getBy')) {
    return `this.page.${locator.selector}`;
  }
  if (locator.strategy === 'css' || locator.strategy === 'xpath') {
    return `this.page.locator(${JSON.stringify(locator.selector)})`;
  }
  return locator.selector.startsWith('this.page.') ? locator.selector : `this.page.locator(${JSON.stringify(locator.selector)})`;
}

function renderAssertionMethod(assertion: WebwrightAssertionSuggestion): string {
  const body = assertion.assertion.trim().replace(/^await\s+/, '');
  const params = assertion.expectedValue !== undefined || body.includes('expected')
    ? '(expected: string): Promise<void>'
    : '(): Promise<void>';
  return `  async ${assertion.methodName}${params} {\n    ${assertion.assertion.trim()}\n  }`;
}

export class WebwrightPatchService {
  apply(finalDir: string, result: WebwrightValidationResult): WebwrightPatchResult {
    const patchedFiles = new Set<string>();
    const warnings: string[] = [...result.warnings];

    for (const locator of result.approvedLocators) {
      const pagePath = path.join(finalDir, 'src', 'pages', `${locator.pageObject}.ts`);
      if (fs.existsSync(pagePath)) {
        this.patchPageObjectLocator(pagePath, locator);
        patchedFiles.add(pagePath);
      } else {
        warnings.push(`Page object not found: ${locator.pageObject}`);
      }

      const locatorFile = this.resolveLocatorFile(finalDir, locator.pageObject);
      if (locatorFile) {
        this.patchLocatorJson(locatorFile, locator);
        patchedFiles.add(locatorFile);
      }
    }

    for (const assertion of result.approvedAssertions) {
      const pagePath = path.join(finalDir, 'src', 'pages', `${assertion.pageObject}.ts`);
      if (fs.existsSync(pagePath)) {
        this.patchPageObjectAssertion(pagePath, assertion);
        patchedFiles.add(pagePath);
      }

      const specFile = this.resolveSpecFile(finalDir, assertion.pageObject);
      if (specFile) {
        this.patchSpecAssertion(specFile, assertion);
        patchedFiles.add(specFile);
      } else {
        warnings.push(`Spec file not found for ${assertion.pageObject}`);
      }
    }

    return {
      patchedFiles: [...patchedFiles],
      recommendationsUsed: result.recommendationsUsed,
      warnings,
    };
  }

  private patchPageObjectLocator(filePath: string, locator: WebwrightLocatorSuggestion): void {
    let source = fs.readFileSync(filePath, 'utf8');
    const fieldPattern = new RegExp(`(private readonly ${escapeRegExp(locator.fieldName)}\\s*=\\s*)([^;]+)(;)`);
    const replacement = `$1${renderLocatorExpression(locator)}$3`;
    if (fieldPattern.test(source)) {
      source = source.replace(fieldPattern, replacement);
    } else {
      const insertion = `  private readonly ${locator.fieldName} = ${renderLocatorExpression(locator)};\n`;
      const classOpen = source.match(/(export class [^{]+{\n)/);
      if (classOpen) {
        source = source.replace(classOpen[1], `${classOpen[1]}${insertion}`);
      } else {
        source = `${insertion}${source}`;
      }
    }
    fs.writeFileSync(filePath, source, 'utf8');
  }

  private patchPageObjectAssertion(filePath: string, assertion: WebwrightAssertionSuggestion): void {
    let source = fs.readFileSync(filePath, 'utf8');
    if (!source.includes("from '@playwright/test'")) {
      return;
    }

    if (!source.includes('expect(')) {
      source = source.replace(
        "import { type Page } from '@playwright/test';",
        "import { type Page, expect } from '@playwright/test';",
      );
    }

    if (!source.includes(`async ${assertion.methodName}`)) {
      const gotoIndex = source.lastIndexOf('\n  async goto(');
      const insertion = `\n${renderAssertionMethod(assertion)}\n`;
      if (gotoIndex > -1) {
        source = `${source.slice(0, gotoIndex)}${insertion}${source.slice(gotoIndex)}`;
      } else {
        source = `${source}\n${renderAssertionMethod(assertion)}\n`;
      }
    }

    fs.writeFileSync(filePath, source, 'utf8');
  }

  private patchSpecAssertion(filePath: string, assertion: WebwrightAssertionSuggestion): void {
    let source = fs.readFileSync(filePath, 'utf8');
    const pageVar = `${toCamel(assertion.pageObject).replace(/Page$/, '')}Page`;
    const expectedArg = assertion.expectedValue !== undefined ? JSON.stringify(assertion.expectedValue) : '';
    const weakPatterns = [
      /await expect\(page\)\.not\.toHaveURL\([^)]*\);?/g,
      /await expect\(page\)\.toHaveURL\([^)]*\);?/g,
      /await expect\(page\.locator\([^)]*\)\)\.toBeVisible\(\);?/g,
      /await expect\(page\.locator\([^)]*\)\)\.toHaveText\([^)]*\);?/g,
    ];
    let patched = source;
    for (const pattern of weakPatterns) {
      patched = patched.replace(pattern, `await ${pageVar}.${assertion.methodName}(${expectedArg});`);
    }
    if (patched !== source) {
      fs.writeFileSync(filePath, patched, 'utf8');
    }
  }

  private patchLocatorJson(filePath: string, locator: WebwrightLocatorSuggestion): void {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
      feature?: string;
      pageObject?: string;
      locators?: Array<Record<string, unknown>>;
    };
    const locators = Array.isArray(raw.locators) ? raw.locators : [];
    const entryIndex = locators.findIndex((entry) => entry.name === locator.fieldName);
    const entry = {
      name: locator.fieldName,
      target: locator.target,
      selector: locator.selector,
      strategy: locator.strategy,
      confidenceScore: locator.confidenceScore,
    };
    if (entryIndex >= 0) {
      locators[entryIndex] = entry;
    } else {
      locators.push(entry);
    }
    raw.locators = locators;
    raw.pageObject = raw.pageObject ?? locator.pageObject;
    raw.feature = raw.feature ?? toKebab(locator.pageObject);
    fs.writeFileSync(filePath, JSON.stringify(raw, null, 2), 'utf8');
  }

  private resolveLocatorFile(finalDir: string, pageObject: string): string | undefined {
    const locatorsDir = path.join(finalDir, 'src', 'locators');
    if (!fs.existsSync(locatorsDir)) return undefined;
    const targetBase = toKebab(pageObject);
    const candidates = fs.readdirSync(locatorsDir).filter((file) => file.endsWith('.locators.json'));
    for (const candidate of candidates) {
      const filePath = path.join(locatorsDir, candidate);
      try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { pageObject?: string; feature?: string };
        if (parsed.pageObject === pageObject || parsed.feature === targetBase || candidate.startsWith(targetBase)) {
          return filePath;
        }
      } catch {
        // ignore malformed files
      }
    }
    return candidates.length > 0 ? path.join(locatorsDir, candidates[0]) : undefined;
  }

  private resolveSpecFile(finalDir: string, pageObject: string): string | undefined {
    const testsDir = path.join(finalDir, 'src', 'tests');
    if (!fs.existsSync(testsDir)) return undefined;
    const candidate = path.join(testsDir, `${toKebab(pageObject)}.spec.ts`);
    if (fs.existsSync(candidate)) return candidate;
    const files = fs.readdirSync(testsDir).filter((file) => file.endsWith('.spec.ts'));
    return files.length > 0 ? path.join(testsDir, files[0]) : undefined;
  }
}
