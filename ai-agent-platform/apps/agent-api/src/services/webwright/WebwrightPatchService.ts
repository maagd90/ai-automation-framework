import fs from 'fs';
import path from 'path';
import type { WebwrightAssertionSuggestion, WebwrightLocatorSuggestion } from './WebwrightResultParser';
import type { WebwrightValidationResult } from './WebwrightSuggestionValidator';
import type { WebwrightPageObjectMetadata } from './WebwrightPageObjectMapper';

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
  const params = assertion.expectedValue !== undefined
    ? '(expected: string): Promise<void>'
    : '(): Promise<void>';
  return `  async ${assertion.methodName}${params} {\n    ${assertion.assertion.trim()}\n  }`;
}

function extractExpectedArgument(assertion: WebwrightAssertionSuggestion): string | undefined {
  if (assertion.expectedValue !== undefined) {
    return toTypeScriptLiteral(assertion.expectedValue);
  }

  const match = assertion.assertion.match(/\bto(?:HaveText|ContainText|HaveValue|HaveAttribute)\(\s*([^)]*?)\s*\)/);
  const value = match?.[1]?.trim();
  if (!value) {
    return undefined;
  }
  const isQuoted = /^['"`].*['"`]$/.test(value);
  const isLiteral = /^(?:true|false|null|undefined|-?\d+(?:\.\d+)?)$/.test(value);
  const isReference = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(value);
  return isQuoted || isLiteral || isReference ? value : undefined;
}

function toTypeScriptLiteral(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export class WebwrightPatchService {
  apply(
    finalDir: string,
    result: WebwrightValidationResult,
    pageObjects: WebwrightPageObjectMetadata[] = [],
  ): WebwrightPatchResult {
    const patchedFiles = new Set<string>();
    const warnings: string[] = [...result.warnings];
    const metadata = pageObjects.length > 0 ? pageObjects : [];

    for (const locator of result.approvedLocators) {
      const resolvedPageObject = this.resolvePageObjectMetadata(finalDir, locator.pageObject, metadata);
      if (resolvedPageObject) {
        this.patchPageObjectLocator(resolvedPageObject.filePath, locator);
        patchedFiles.add(resolvedPageObject.filePath);
      } else {
        warnings.push(`Page object not found: ${locator.pageObject}`);
      }

      const locatorFile = this.resolveLocatorFile(finalDir, locator.pageObject, metadata);
      if (locatorFile) {
        this.patchLocatorJson(locatorFile, locator);
        patchedFiles.add(locatorFile);
      } else {
        warnings.push(`Locator JSON not found for ${locator.pageObject}`);
      }
    }

    for (const assertion of result.approvedAssertions) {
      const resolvedPageObject = this.resolvePageObjectMetadata(finalDir, assertion.pageObject, metadata);
      if (resolvedPageObject) {
        this.patchPageObjectAssertion(resolvedPageObject.filePath, assertion);
        patchedFiles.add(resolvedPageObject.filePath);
      } else {
        warnings.push(`Page object not found: ${assertion.pageObject}`);
      }

      const specFile = this.resolveSpecFile(finalDir, assertion.pageObject, metadata);
      if (specFile) {
        if (this.patchSpecAssertion(specFile, assertion)) {
          patchedFiles.add(specFile);
        } else {
          warnings.push(`Spec assertion patch skipped for ${assertion.methodName}`);
        }
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

  private patchSpecAssertion(filePath: string, assertion: WebwrightAssertionSuggestion): boolean {
    let source = fs.readFileSync(filePath, 'utf8');
    const pageVar = `${toCamel(assertion.pageObject).replace(/Page$/, '')}Page`;
    const expectedArg = extractExpectedArgument(assertion);
    const needsExpectedArg = /\bexpected\b/.test(assertion.assertion) || /to(?:HaveText|ContainText|HaveValue|HaveAttribute)\(/.test(assertion.assertion);
    const weakPatterns = [
      /await expect\(page\)\.not\.toHaveURL\([^)]*\);?/g,
      /await expect\(page\)\.toHaveURL\([^)]*\);?/g,
      /await expect\(page\.locator\([^)]*\)\)\.toBeVisible\(\);?/g,
      /await expect\(page\.locator\([^)]*\)\)\.toHaveText\([^)]*\);?/g,
    ];
    if (needsExpectedArg && expectedArg === undefined) {
      return false;
    }
    let patched = source;
    for (const pattern of weakPatterns) {
      patched = patched.replace(pattern, expectedArg ? `await ${pageVar}.${assertion.methodName}(${expectedArg});` : `await ${pageVar}.${assertion.methodName}();`);
    }
    if (patched === source) return false;
    fs.writeFileSync(filePath, patched, 'utf8');
    return true;
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

  private resolvePageObjectMetadata(
    finalDir: string,
    pageObject: string,
    pageObjects: WebwrightPageObjectMetadata[],
  ): WebwrightPageObjectMetadata | undefined {
    const exact = pageObjects.find((candidate) =>
      candidate.className === pageObject ||
      candidate.filePath.endsWith(`${path.sep}${pageObject}.ts`) ||
      candidate.locatorJsonPath?.includes(`${path.sep}${pageObject.toLowerCase().replace(/page$/, '')}`),
    );
    if (exact) return exact;

    const fallbackPath = path.join(finalDir, 'src', 'pages', `${pageObject}.ts`);
    if (fs.existsSync(fallbackPath)) {
      return {
        className: pageObject,
        filePath: fallbackPath,
        locatorFields: [],
        methods: [],
        relatedSpecImports: [],
        relatedSpecFiles: [],
      };
    }
    return undefined;
  }

  private resolveLocatorFile(finalDir: string, pageObject: string, pageObjects: WebwrightPageObjectMetadata[]): string | undefined {
    const metadata = pageObjects.find((candidate) => candidate.className === pageObject || candidate.feature === pageObject);
    if (metadata?.locatorJsonPath) {
      return metadata.locatorJsonPath;
    }

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

  private resolveSpecFile(finalDir: string, pageObject: string, pageObjects: WebwrightPageObjectMetadata[]): string | undefined {
    const metadata = pageObjects.find((candidate) => candidate.className === pageObject);
    if (metadata?.relatedSpecFiles.length) {
      return metadata.relatedSpecFiles[0];
    }

    const testsDir = path.join(finalDir, 'src', 'tests');
    if (!fs.existsSync(testsDir)) return undefined;
    const candidate = path.join(testsDir, `${toKebab(pageObject)}.spec.ts`);
    if (fs.existsSync(candidate)) return candidate;
    const files = fs.readdirSync(testsDir).filter((file) => file.endsWith('.spec.ts'));
    return files.length > 0 ? path.join(testsDir, files[0]) : undefined;
  }
}
