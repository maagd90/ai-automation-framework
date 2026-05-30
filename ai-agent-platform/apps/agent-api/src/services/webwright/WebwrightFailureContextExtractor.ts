import fs from 'fs';
import path from 'path';
import type { WebwrightFailureCategory } from './WebwrightFailureClassifier';
import { WebwrightFailureClassifier } from './WebwrightFailureClassifier';
import type { GeneratedSpecSource } from './WebwrightStepReplayPlanBuilder';
import type { WebwrightPageObjectMetadata } from './WebwrightPageObjectMapper';

export interface WebwrightFailureContext {
  failedSpecPath?: string;
  failedTestTitle?: string;
  failedSelector?: string;
  failedMethod?: string;
  failedPageObject?: string;
  failedAssertion?: string;
  failureCategory: WebwrightFailureCategory;
}

export interface WebwrightFailureContextInput {
  stdout: string;
  stderr: string;
  failedSpecPath?: string;
  generatedSpecSources: GeneratedSpecSource[];
  pageObjects: WebwrightPageObjectMetadata[];
}

export interface WebwrightFailureContextResult {
  failureContext: WebwrightFailureContext;
  warnings: string[];
}

function compact(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function extractSpecFrame(text: string): { specPath?: string; line?: number } {
  const match = text.match(/([A-Za-z0-9_./-]+\.spec\.ts):(\d+):(\d+)/);
  if (!match) return {};
  return { specPath: match[1], line: Number(match[2]) };
}

function findSource(specPath: string | undefined, sources: GeneratedSpecSource[]): GeneratedSpecSource | undefined {
  if (!specPath) return undefined;
  return sources.find((source) => path.normalize(source.filePath) === path.normalize(specPath));
}

function getLine(source: string, lineNumber: number | undefined): string | undefined {
  if (!lineNumber || lineNumber < 1) return undefined;
  return source.split(/\r?\n/)[lineNumber - 1];
}

function parseTestTitle(source: string): string | undefined {
  const match = source.match(/test\(\s*(['"`])([\s\S]*?)\1\s*,/);
  return match?.[2];
}

function parseSpecMapping(source: string): Map<string, string> {
  const mappings = new Map<string, string>();
  for (const match of source.matchAll(/const (\w+)\s*=\s*new\s+(\w+)\(page\)/g)) {
    mappings.set(match[1], match[2]);
  }
  return mappings;
}

function resolveMethodSelector(pageObject: WebwrightPageObjectMetadata | undefined, methodName: string): string | undefined {
  if (!pageObject) return undefined;
  try {
    const source = fs.readFileSync(pageObject.filePath, 'utf8');
    const start = source.indexOf(`async ${methodName}(`);
    if (start === -1) return undefined;
    const tail = source.slice(start);
    const end = tail.search(/\n\s+async\s+\w+\(/);
    const body = end > 0 ? tail.slice(0, end) : tail;

    const direct = body.match(/this\.page\.(locator|getByRole|getByLabel|getByPlaceholder|getByText|getByTestId)\(([^)]+)\)/);
    if (direct) {
      return `page.${direct[1]}(${direct[2]})`;
    }

    const field = body.match(/this\.(\w+)\.(?:click|fill|selectOption|check|uncheck|waitFor|press)\(/);
    if (field) {
      const locatorField = pageObject.locatorFields.find((entry) => entry.name === field[1]);
      return locatorField?.selector.replace(/^this\./, '').replace(/^page\.page\./, 'page.');
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function extractSelectorFromLine(line: string): string | undefined {
  const selectorMatch = line.match(/(page\.(?:locator|getByRole|getByLabel|getByPlaceholder|getByText|getByTestId)\([^;]+\))/);
  if (selectorMatch) return selectorMatch[1];
  const expectMatch = line.match(/expect\(([^)]+)\)\.(to\w+)\(/);
  if (expectMatch) return expectMatch[1];
  return undefined;
}

function extractAssertion(line: string): string | undefined {
  const match = line.match(/(await\s+expect\([^;]+\);?)/);
  return match?.[1];
}

function extractMethod(line: string): string | undefined {
  const match = line.match(/await\s+(\w+)\.(\w+)\(([^;]*)\)/);
  return match?.[2];
}

function extractPageObject(line: string, mappings: Map<string, string>): string | undefined {
  const match = line.match(/await\s+(\w+)\.(\w+)\(/);
  if (!match) return undefined;
  return mappings.get(match[1]);
}

export class WebwrightFailureContextExtractor {
  private readonly classifier = new WebwrightFailureClassifier();

  extract(input: WebwrightFailureContextInput): WebwrightFailureContextResult {
    const warnings: string[] = [];
    const combined = `${input.stdout}\n${input.stderr}`;
    const failureCategory = this.classifier.classify(combined);
    const stackFrame = extractSpecFrame(combined);
    const specPath = input.failedSpecPath ?? stackFrame.specPath;
    const source = findSource(specPath, input.generatedSpecSources);

    if (specPath && !source) {
      warnings.push(`Failed spec source not found for ${specPath}`);
    }

    const sourceText = source?.source ?? '';
    const mappings = parseSpecMapping(sourceText);
    const line = getLine(sourceText, stackFrame.line);
    const title = sourceText ? parseTestTitle(sourceText) : undefined;

    let failedMethod: string | undefined;
    let failedSelector: string | undefined;
    let failedPageObject: string | undefined;
    let failedAssertion: string | undefined;

    if (line) {
      failedMethod = extractMethod(line);
      failedSelector = extractSelectorFromLine(line);
      failedAssertion = extractAssertion(line);
      failedPageObject = extractPageObject(line, mappings);
    }

    const selectorFromLogs = combined.match(/(page\.(?:locator|getByRole|getByLabel|getByPlaceholder|getByText|getByTestId)\([^;]+?\))/)?.[1];
    failedSelector = failedSelector ?? selectorFromLogs;
    failedAssertion = failedAssertion ?? combined.match(/(await\s+expect\([^;]+\);?)/)?.[1];

    if (!failedPageObject && failedMethod) {
      const pageObjectFromMetadata = input.pageObjects.find((pageObject) =>
        pageObject.methods.some((method) => method.name === failedMethod),
      );
      failedPageObject = pageObjectFromMetadata?.className;
      if (pageObjectFromMetadata && !failedSelector) {
        failedSelector = resolveMethodSelector(pageObjectFromMetadata, failedMethod);
      }
    }

    if (!failedPageObject && specPath) {
      const pageObjectFromImport = input.pageObjects.find((pageObject) =>
        pageObject.relatedSpecFiles.some((specFile) => path.normalize(specFile) === path.normalize(specPath)),
      );
      failedPageObject = pageObjectFromImport?.className ?? failedPageObject;
    }

    if (!failedSelector && failedPageObject && failedMethod) {
      const pageObject = input.pageObjects.find((entry) => entry.className === failedPageObject);
      failedSelector = resolveMethodSelector(pageObject, failedMethod);
    }

    if (!failedSelector && line) {
      failedSelector = extractSelectorFromLine(line);
    }

    if (!title && sourceText) {
      warnings.push('Failed test title could not be extracted from spec source');
    }

    if (!failedMethod && /assertion/i.test(combined)) {
      failedMethod = 'assertion';
    }

    if (!failedAssertion && /expect\(/.test(combined)) {
      failedAssertion = combined.match(/(await\s+expect\([^;]+\);?)/)?.[1] ?? compact(line);
    }

    if (!failedSelector && /locator timeout|waiting for selector/i.test(combined)) {
      const selectorMatch = combined.match(/(?:locator|waiting for selector)\s+([^\n]+)/i);
      if (selectorMatch) {
        failedSelector = compact(selectorMatch[1]);
      }
    }

    const failureContext: WebwrightFailureContext = {
      failedSpecPath: specPath,
      failedTestTitle: title,
      failedSelector,
      failedMethod,
      failedPageObject,
      failedAssertion,
      failureCategory,
    };

    return { failureContext, warnings };
  }
}
