import fs from 'fs';
import path from 'path';
import { LocatorArtifactParser, type LocatorEntry } from './LocatorArtifactParser';

export interface NormalizedMethod {
  name: string;
  body: string;
  locatorStrategy: string;
}

export interface NormalizedPageModel {
  className: string;
  routePath: string;
  methods: NormalizedMethod[];
}

export interface NormalizedSpecModel {
  title: string;
  body: string;
  dataReferences: string[];
}

export interface NormalizedArtifact {
  feature: string;
  page?: NormalizedPageModel;
  specs: NormalizedSpecModel[];
  testData: Record<string, unknown>;
  locators: LocatorEntry[];
}

function featureKeyFromClassName(className: string): string {
  // Convert PascalCase page names (e.g. LoginPage) into the canonical feature
  // key used by the merge pipeline (login).
  return className.replace(/Page$/, '').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase() || 'home';
}

function extractMethods(source: string): NormalizedMethod[] {
  const methods: NormalizedMethod[] = [];
  const sigPattern = /^\s+async (\w+)\([^)]*\): Promise<[^>]+> \{/gm;
  let match: RegExpExecArray | null;

  while ((match = sigPattern.exec(source)) !== null) {
    const name = match[1];
    if (name === 'goto') continue;
    let depth = 1;
    let cursor = match.index + match[0].length;
    while (cursor < source.length && depth > 0) {
      if (source[cursor] === '{') depth++;
      else if (source[cursor] === '}') depth--;
      cursor++;
    }
    const body = source.slice(match.index, cursor).trim();
    const locatorStrategy = ['getByTestId', 'getByRole', 'getByLabel', 'getByPlaceholder', 'getByText']
      .find((strategy) => body.includes(strategy)) ?? 'locator';
    methods.push({ name, body, locatorStrategy });
  }

  return methods;
}

function extractTestBlocks(source: string): NormalizedSpecModel[] {
  const blocks: NormalizedSpecModel[] = [];
  const titlePattern = /^test\((["'`])([\s\S]*?)\1,/gm;
  let match: RegExpExecArray | null;

  while ((match = titlePattern.exec(source)) !== null) {
    const searchFrom = match.index + match[0].length;
    const arrowIdx = source.indexOf('=>', searchFrom);
    if (arrowIdx === -1) continue;
    const bodyStart = source.indexOf('{', arrowIdx);
    if (bodyStart === -1) continue;
    let depth = 1;
    let cursor = bodyStart + 1;
    while (cursor < source.length && depth > 0) {
      if (source[cursor] === '{') depth++;
      else if (source[cursor] === '}') depth--;
      cursor++;
    }
    const closingIdx = source.indexOf(');', cursor);
    const block = source.slice(match.index, closingIdx !== -1 ? closingIdx + 2 : cursor).trim();
    const title = match[2];
    const dataReferences = Array.from(block.matchAll(/\b\w+Data\.(\w+)(?:\??\.(\w+))?/g))
      .map((ref) => [ref[1], ref[2]].filter(Boolean).join('.'));
    blocks.push({ title, body: block, dataReferences });
  }

  return blocks;
}

export class ArtifactNormalizer {
  private readonly locatorParser = new LocatorArtifactParser();

  normalizeChildOutput(srcDir: string): NormalizedArtifact[] {
    const normalizedManifest = path.join(srcDir, 'normalized-artifact.json');
    if (fs.existsSync(normalizedManifest)) {
      try {
        return [JSON.parse(fs.readFileSync(normalizedManifest, 'utf8')) as NormalizedArtifact];
      } catch {
        // fall through to raw normalization
      }
    }

    const artifacts = new Map<string, NormalizedArtifact>();
    this.collectPages(srcDir, artifacts);
    this.collectSpecs(srcDir, artifacts);
    this.collectData(srcDir, artifacts);
    this.collectLocators(srcDir, artifacts);
    return Array.from(artifacts.values());
  }

  private collectPages(srcDir: string, artifacts: Map<string, NormalizedArtifact>): void {
    const pagesDir = this.resolveSubdir(srcDir, 'pages');
    if (!fs.existsSync(pagesDir)) return;

    for (const entry of fs.readdirSync(pagesDir)) {
      if (!entry.endsWith('.ts')) continue;
      const source = fs.readFileSync(path.join(pagesDir, entry), 'utf8');
      const classMatch = source.match(/export class (\w+)\s*\{/);
      if (!classMatch?.[1]) continue;
      const className = classMatch[1];
      const feature = featureKeyFromClassName(className);
      const routePath = source.match(/await this\.page\.goto\((['"`])(.*?)\1\)/)?.[2] ?? '/';
      const artifact = this.ensureArtifact(artifacts, feature);
      artifact.page = { className, routePath, methods: extractMethods(source) };
    }
  }

  private collectSpecs(srcDir: string, artifacts: Map<string, NormalizedArtifact>): void {
    const testsDir = this.resolveSubdir(srcDir, 'tests');
    if (!fs.existsSync(testsDir)) return;

    for (const entry of fs.readdirSync(testsDir)) {
      if (!entry.endsWith('.ts')) continue;
      const source = fs.readFileSync(path.join(testsDir, entry), 'utf8');
      const classMatch = source.match(/import \{ (\w+) \} from ['"]\.\.\/pages\/(\w+)['"]/);
      const feature = classMatch ? featureKeyFromClassName(classMatch[1]) : entry.replace(/\.spec\.ts$/, '');
      const artifact = this.ensureArtifact(artifacts, feature);
      artifact.specs.push(...extractTestBlocks(source));
    }
  }

  private collectData(srcDir: string, artifacts: Map<string, NormalizedArtifact>): void {
    const dataDir = this.resolveSubdir(srcDir, 'test-data');
    if (!fs.existsSync(dataDir)) return;

    for (const entry of fs.readdirSync(dataDir)) {
      if (!entry.endsWith('.json')) continue;
      try {
        const feature = entry.replace(/\.data\.json$/, '');
        const artifact = this.ensureArtifact(artifacts, feature);
        artifact.testData = JSON.parse(fs.readFileSync(path.join(dataDir, entry), 'utf8')) as Record<string, unknown>;
      } catch {
        // ignore malformed data
      }
    }
  }

  private collectLocators(srcDir: string, artifacts: Map<string, NormalizedArtifact>): void {
    const locatorsDir = this.resolveSubdir(srcDir, 'locators');
    if (!fs.existsSync(locatorsDir)) return;

    for (const entry of fs.readdirSync(locatorsDir)) {
      if (!entry.endsWith('.json')) continue;
      const parsed = this.locatorParser.parseFile(path.join(locatorsDir, entry));
      if (!parsed) continue;
      const artifact = this.ensureArtifact(artifacts, parsed.feature);
      artifact.locators.push(...parsed.entries);
    }
  }

  private ensureArtifact(artifacts: Map<string, NormalizedArtifact>, feature: string): NormalizedArtifact {
    let artifact = artifacts.get(feature);
    if (!artifact) {
      artifact = { feature, specs: [], testData: {}, locators: [] };
      artifacts.set(feature, artifact);
    }
    return artifact;
  }

  private resolveSubdir(srcDir: string, section: string): string {
    const srcBased = path.join(srcDir, 'src', section);
    return fs.existsSync(srcBased) ? srcBased : path.join(srcDir, section);
  }
}
