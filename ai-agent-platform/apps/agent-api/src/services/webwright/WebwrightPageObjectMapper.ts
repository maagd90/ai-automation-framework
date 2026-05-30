import fs from 'fs';
import path from 'path';

export interface WebwrightPageLocatorField {
  name: string;
  selector: string;
  strategy?: string;
}

export interface WebwrightPageMethod {
  name: string;
}

export interface WebwrightPageObjectMetadata {
  className: string;
  filePath: string;
  locatorFields: WebwrightPageLocatorField[];
  methods: WebwrightPageMethod[];
  relatedSpecImports: string[];
  relatedSpecFiles: string[];
  locatorJsonPath?: string;
  feature?: string;
}

export interface WebwrightPageObjectCandidate {
  failedSpecPath?: string;
  failedTestTitle?: string;
  failedSelector?: string;
  failedMethod?: string;
  failedPageObject?: string;
  failedAssertion?: string;
  failureCategory?: string;
  stepIntent?: string;
  targetUrl?: string;
  browserTitle?: string;
}

export interface WebwrightPageObjectMappingResult {
  pageObject?: WebwrightPageObjectMetadata;
  reason?: string;
  warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toFeatureKey(className: string): string {
  return className.replace(/Page$/, '').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function parseClassName(source: string): string | undefined {
  const match = source.match(/export class ([A-Z][A-Za-z0-9_]*)/);
  return match?.[1];
}

function parseMethods(source: string): WebwrightPageMethod[] {
  const methods: WebwrightPageMethod[] = [];
  for (const match of source.matchAll(/^\s+async (\w+)\(/gm)) {
    methods.push({ name: match[1] });
  }
  return methods;
}

function parseLocatorFields(source: string): WebwrightPageLocatorField[] {
  const fields: WebwrightPageLocatorField[] = [];
  for (const match of source.matchAll(/^\s+private readonly (\w+)\s*=\s*(.+);$/gm)) {
    fields.push({ name: match[1], selector: match[2].trim() });
  }
  return fields;
}

function walkFiles(dir: string, predicate: (fileName: string) => boolean): string[] {
  if (!fs.existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(entryPath, predicate));
      continue;
    }
    if (entry.isFile() && predicate(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

function loadJson(filePath: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return undefined;
  }
}

function keywordScore(haystack: string, keywords: string[]): number {
  const normalized = haystack.toLowerCase();
  return keywords.reduce((score, keyword) => score + (normalized.includes(keyword) ? 1 : 0), 0);
}

export class WebwrightPageObjectMapper {
  collect(finalDir: string): WebwrightPageObjectMetadata[] {
    const pagesDir = path.join(finalDir, 'src', 'pages');
    const testsDir = path.join(finalDir, 'src', 'tests');
    const locatorsDir = path.join(finalDir, 'src', 'locators');
    const pageFiles = walkFiles(pagesDir, (name) => name.endsWith('.ts'));
    const specFiles = walkFiles(testsDir, (name) => name.endsWith('.spec.ts'));
    const locatorFiles = walkFiles(locatorsDir, (name) => name.endsWith('.json'));

    const metadataByClass = new Map<string, WebwrightPageObjectMetadata>();

    for (const filePath of pageFiles) {
      const source = fs.readFileSync(filePath, 'utf8');
      const className = parseClassName(source);
      if (!className) continue;
      metadataByClass.set(className, {
        className,
        filePath,
        locatorFields: parseLocatorFields(source),
        methods: parseMethods(source),
        relatedSpecImports: [],
        relatedSpecFiles: [],
      });
    }

    for (const specPath of specFiles) {
      const source = fs.readFileSync(specPath, 'utf8');
      for (const metadata of metadataByClass.values()) {
        const specImportPattern = new RegExp(`from\\s+['"](?:\\.\\./)+pages\\/${metadata.className}['"]`);
        if (specImportPattern.test(source)) {
          metadata.relatedSpecFiles.push(specPath);
          metadata.relatedSpecImports.push(`../pages/${metadata.className}`);
        }
      }
    }

    for (const locatorPath of locatorFiles) {
      const parsed = loadJson(locatorPath);
      if (!isRecord(parsed)) continue;
      const feature = typeof parsed.feature === 'string' ? parsed.feature : undefined;
      const pageObject = typeof parsed.pageObject === 'string' ? parsed.pageObject : undefined;
      for (const metadata of metadataByClass.values()) {
        const featureKey = toFeatureKey(metadata.className);
        if (pageObject === metadata.className || feature === featureKey || path.basename(locatorPath, '.json').startsWith(featureKey)) {
          metadata.locatorJsonPath = locatorPath;
          metadata.feature = feature ?? metadata.feature ?? featureKey;
        }
      }
    }

    return [...metadataByClass.values()].sort((a, b) => a.className.localeCompare(b.className));
  }

  map(candidate: WebwrightPageObjectCandidate, pageObjects: WebwrightPageObjectMetadata[]): WebwrightPageObjectMappingResult {
    const warnings: string[] = [];
    if (pageObjects.length === 0) {
      return { warnings: ['No generated page objects were found'] };
    }

    const byClass = (className?: string) => pageObjects.find((pageObject) => pageObject.className === className);
    const byFile = (filePath?: string) => pageObjects.find((pageObject) => pageObject.filePath === filePath);

    if (candidate.failedSpecPath && candidate.failedMethod) {
      const exact = pageObjects.find((pageObject) =>
        pageObject.relatedSpecFiles.includes(candidate.failedSpecPath!) &&
        pageObject.methods.some((method) => method.name === candidate.failedMethod),
      );
      if (exact) {
        return { pageObject: exact, reason: 'matched failed spec import and method', warnings };
      }
    }

    if (candidate.failedPageObject || candidate.failedMethod || candidate.failedSelector) {
      const exact = byClass(candidate.failedPageObject) ?? byFile(candidate.failedPageObject);
      if (exact && (
        !candidate.failedMethod || exact.methods.some((method) => method.name === candidate.failedMethod)
      )) {
        return { pageObject: exact, reason: 'matched existing page object metadata', warnings };
      }

      if (candidate.failedSelector) {
        const selectorMatch = pageObjects.find((pageObject) =>
          pageObject.locatorFields.some((field) => field.selector === candidate.failedSelector),
        );
        if (selectorMatch) {
          return { pageObject: selectorMatch, reason: 'matched locator field selector', warnings };
        }
      }
    }

    const intentHaystack = [
      candidate.stepIntent,
      candidate.failedTestTitle,
      candidate.failedAssertion,
      candidate.failedSelector,
      candidate.failureCategory,
      candidate.targetUrl,
      candidate.browserTitle,
    ]
      .filter(Boolean)
      .join(' ');

    const intentKeywords = this.buildIntentKeywords(intentHaystack);
    const scoreCandidates = pageObjects
      .map((pageObject) => ({
        pageObject,
        score: keywordScore(pageObject.className, intentKeywords)
          + keywordScore(pageObject.feature ?? '', intentKeywords)
          + keywordScore(pageObject.relatedSpecImports.join(' '), intentKeywords),
      }))
      .filter((candidateScore) => candidateScore.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scoreCandidates.length > 0) {
      return {
        pageObject: scoreCandidates[0].pageObject,
        reason: 'matched step intent / page responsibility heuristics',
        warnings,
      };
    }

    const titleOrUrl = [candidate.browserTitle, candidate.targetUrl].filter(Boolean).join(' ');
    if (titleOrUrl) {
      const fallback = pageObjects.find((pageObject) => keywordScore(pageObject.className, this.buildIntentKeywords(titleOrUrl)) > 0);
      if (fallback) {
        return { pageObject: fallback, reason: 'matched browser title / URL fallback', warnings };
      }
    }

    warnings.push(`No safe page object mapping found for ${candidate.failedPageObject ?? candidate.failedMethod ?? candidate.failedTestTitle ?? 'unknown failure'}`);
    return { warnings };
  }

  private buildIntentKeywords(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .map((token) => token.trim())
      .filter((token) => token.length > 0)
      .filter((token) => !['page', 'button', 'buttons', 'field', 'fields', 'test', 'spec', 'src', 'http', 'https', 'localhost', 'www'].includes(token));
  }
}
