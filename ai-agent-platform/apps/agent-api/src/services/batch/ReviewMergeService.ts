import fs from 'fs';
import path from 'path';
import { JOBS_BASE_DIR } from '../../config';
import type { JobEntity } from '../../domain/Job';
import { logger } from '../../utils/logger';

// ---------------------------------------------------------------------------
// Internal data structures for parsed generated artefacts
// ---------------------------------------------------------------------------

interface ParsedMethod {
  /** Camel-case method name, e.g. enterUsername */
  name: string;
  /** Full method text block (indented, ready for insertion into a class body) */
  body: string;
  /** Locator strategy extracted from the method body (used for confidence scoring) */
  locatorStrategy: string;
}

interface ParsedPom {
  /** PascalCase class name, e.g. LoginPage */
  className: string;
  /** Normalised feature key derived from the class name, e.g. 'login' */
  featureKey: string;
  /** Route path used in goto() */
  routePath: string;
  /** Extracted non-goto methods */
  methods: ParsedMethod[];
}

interface ParsedTestBlock {
  /** The test title string (already JSON-quoted), e.g. "Valid login" */
  title: string;
  /** Full test() call text */
  body: string;
}

interface ParsedSpec {
  /** PascalCase page class name */
  className: string;
  /** camelCase data variable */
  dataVarName: string;
  /** Spec base name, e.g. 'login' */
  specName: string;
  testBlocks: ParsedTestBlock[];
}

interface ParsedDataFile {
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Locator strategy priority for deduplication (higher = preferred)
// ---------------------------------------------------------------------------

const LOCATOR_PRIORITY: Record<string, number> = {
  getByTestId: 5,
  getByRole: 4,
  getByLabel: 3,
  getByPlaceholder: 2,
  getByText: 1,
  locator: 0,
};

function locatorPriority(strategy: string): number {
  return LOCATOR_PRIORITY[strategy] ?? 0;
}

// ---------------------------------------------------------------------------
// TypeScript source parsers (deterministic, regex-based, format-aware)
// ---------------------------------------------------------------------------

/**
 * Extracts a method-level locator strategy tag from the method body text.
 * Returns the first recognised strategy string or 'locator' as fallback.
 */
function extractLocatorStrategy(methodBody: string): string {
  for (const strategy of Object.keys(LOCATOR_PRIORITY)) {
    if (methodBody.includes(`this.page.${strategy}`)) return strategy;
  }
  return 'locator';
}

/**
 * Parses a generated PageObject TypeScript source file into a {@link ParsedPom}.
 *
 * Relies on the fixed template produced by {@link PageObjectGenerator}:
 *  - Class declaration: `export class ${ClassName} {`
 *  - Methods: `  async methodName(...): Promise<...> { ... }`
 *  - goto() is excluded from the methods list (re-generated later).
 */
function parsePomSource(source: string): ParsedPom | null {
  const classMatch = source.match(/export class (\w+)\s*\{/);
  if (!classMatch) return null;
  const className = classMatch[1];
  const featureKey = classNameToFeatureKey(className);

  const gotoMatch = source.match(/await this\.page\.goto\((['"`])(.*?)\1\)/);
  const routePath = gotoMatch?.[2] ?? '/';

  const methods = extractPomMethods(source);

  return { className, featureKey, routePath, methods };
}

/**
 * Extracts all `async` method blocks from a POM source, excluding `goto`.
 * Uses brace-depth tracking to handle multi-line method bodies correctly.
 */
function extractPomMethods(source: string): ParsedMethod[] {
  const methods: ParsedMethod[] = [];
  // Match the start of each async method signature
  const sigPattern = /^  async (\w+)\([^)]*\): Promise<[^>]+> \{/gm;
  let match: RegExpExecArray | null;

  while ((match = sigPattern.exec(source)) !== null) {
    const name = match[1];
    if (name === 'goto') continue;

    // Collect full method body by brace depth tracking
    let depth = 1;
    let i = match.index + match[0].length;
    while (i < source.length && depth > 0) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') depth--;
      i++;
    }

    const body = source.slice(match.index, i).trim();
    const locatorStrategy = extractLocatorStrategy(body);

    methods.push({ name, body, locatorStrategy });
  }

  return methods;
}

/**
 * Parses a generated spec TypeScript source file into a {@link ParsedSpec}.
 *
 * Relies on the fixed template produced by {@link SpecGenerator}:
 *  - Import: `import { ClassName } from '../pages/ClassName'`
 *  - Data import: `import dataVar from '../test-data/specName.data.json'`
 *  - Each test case is a top-level `test(...)` call.
 */
function parseSpecSource(source: string): ParsedSpec | null {
  const importMatch = source.match(/import \{ (\w+) \} from ['"]\.\.\/pages\/(\w+)['"]/);
  if (!importMatch) return null;
  const className = importMatch[1];

  const dataMatch = source.match(/import (\w+) from ['"]\.\.\/test-data\/([^'"]+)['"]/);
  const dataVarName = dataMatch?.[1] ?? `${lcFirst(className)}Data`;
  const specName = dataMatch?.[2]?.replace('.data.json', '') ?? classNameToFeatureKey(className);

  const testBlocks = extractTestBlocks(source);

  return { className, dataVarName, specName, testBlocks };
}

/**
 * Extracts all `test(...)` calls from a spec file.
 * Brace-depth tracking correctly handles nested async arrow functions.
 */
function extractTestBlocks(source: string): ParsedTestBlock[] {
  const blocks: ParsedTestBlock[] = [];
  // Match `test("...",` or `test('...',`
  const titlePattern = /^test\((["'`])([\s\S]*?)\1,/gm;
  let match: RegExpExecArray | null;

  while ((match = titlePattern.exec(source)) !== null) {
    const title = `${match[1]}${match[2]}${match[1]}`;
    // Walk forward from the title to find the opening `{` of the async arrow
    let arrowStart = source.indexOf('{', match.index + match[0].length);
    if (arrowStart === -1) continue;

    let depth = 1;
    let i = arrowStart + 1;
    while (i < source.length && depth > 0) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') depth--;
      i++;
    }

    // Include the closing `);`
    const closingEnd = source.indexOf(');', i);
    const bodyEnd = closingEnd !== -1 ? closingEnd + 2 : i;
    const body = source.slice(match.index, bodyEnd).trim();
    blocks.push({ title, body });
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function lcFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * Converts a PascalCase class name (e.g. `LoginPage`) to a kebab-case feature
 * key (e.g. `login`) by dropping a trailing `Page` suffix.
 */
function classNameToFeatureKey(className: string): string {
  const withoutPage = className.replace(/Page$/, '');
  return withoutPage.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase() || 'general';
}

/**
 * Converts a feature key (e.g. `login`) to a PascalCase class name (`LoginPage`).
 */
function featureKeyToClassName(featureKey: string): string {
  const pascal = featureKey
    .split(/[-_]/)
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join('');
  return `${pascal}Page`;
}

// ---------------------------------------------------------------------------
// Merge stats (for logging)
// ---------------------------------------------------------------------------

interface MergeStats {
  childOutputsReceived: number;
  featuresDetected: string[];
  duplicateSpecsRemoved: number;
  duplicateMethodsMerged: number;
  duplicateLocatorsRemoved: number;
  finalFilesGenerated: number;
}

// ---------------------------------------------------------------------------
// ReviewMergeService
// ---------------------------------------------------------------------------

/**
 * Post-execution merge service that consolidates all child agent outputs into a
 * single enterprise-quality Playwright project.
 *
 * Instead of the naive "copy + rename with childId" approach of {@link ProjectMerger},
 * ReviewMergeService:
 *  1. Scans every child output directory for generated `.ts` and `.json` files.
 *  2. Groups artefacts by POM class name (= feature: login, cart, checkout…).
 *  3. Merges all POM files for the same feature into ONE `<Feature>Page.ts`,
 *     deduplicating methods by name (keeping the highest-confidence locator).
 *  4. Merges all spec files for the same feature into ONE `<feature>.spec.ts`,
 *     deduplicating test blocks by title.
 *  5. Merges test-data JSON files by shallow key merge.
 *  6. Scaffolds project-level files (package.json, playwright.config.ts, tsconfig.json,
 *     wait utility, README).
 *  7. Optionally runs Prettier on all generated TypeScript sources.
 *
 * Logging is emitted at each step via the structured logger with no secrets.
 */
export class ReviewMergeService {
  /**
   * Performs the full intelligent merge for the given job.
   *
   * @param job - The job entity (provides jobId and execution settings).
   * @param childIds - Ordered list of child agent identifiers whose outputs to merge.
   * @returns Absolute path to the final merged project directory.
   */
  merge(job: JobEntity, childIds: string[]): string {
    const finalDir = path.join(JOBS_BASE_DIR, job.jobId, 'final-project');
    fs.rmSync(finalDir, { recursive: true, force: true });
    fs.mkdirSync(finalDir, { recursive: true });
    this.ensureProjectDirs(finalDir);

    const stats: MergeStats = {
      childOutputsReceived: 0,
      featuresDetected: [],
      duplicateSpecsRemoved: 0,
      duplicateMethodsMerged: 0,
      duplicateLocatorsRemoved: 0,
      finalFilesGenerated: 0,
    };

    // ── Step 1: Collect all child artefacts ────────────────────────────────
    const pomsByFeature = new Map<string, ParsedPom[]>();
    const specsByFeature = new Map<string, ParsedSpec[]>();
    const dataByFeature = new Map<string, ParsedDataFile[]>();

    for (const childId of childIds) {
      const srcDir = path.join(JOBS_BASE_DIR, job.jobId, 'children', childId, 'generated');
      if (!fs.existsSync(srcDir)) continue;

      stats.childOutputsReceived++;

      this.collectPoms(srcDir, pomsByFeature);
      this.collectSpecs(srcDir, specsByFeature);
      this.collectData(srcDir, dataByFeature);
      this.copyLocators(srcDir, finalDir, childId);
    }

    // ── Step 2: Determine detected features ────────────────────────────────
    const allFeatures = new Set([
      ...pomsByFeature.keys(),
      ...specsByFeature.keys(),
    ]);
    stats.featuresDetected = Array.from(allFeatures);

    logger.info('[ReviewMerge] child outputs collected', {
      jobId: job.jobId,
      childOutputsReceived: stats.childOutputsReceived,
      featuresDetected: stats.featuresDetected,
    });

    // ── Step 3: Merge and write final files per feature ────────────────────
    for (const feature of allFeatures) {
      const poms = pomsByFeature.get(feature) ?? [];
      const specs = specsByFeature.get(feature) ?? [];
      const datas = dataByFeature.get(feature) ?? [];

      if (poms.length > 0) {
        const { file: pomFile, methodsMerged } = this.mergePoms(feature, poms);
        stats.duplicateMethodsMerged += methodsMerged;

        const pomPath = path.join(finalDir, 'src', 'pages', `${featureKeyToClassName(feature)}.ts`);
        fs.writeFileSync(pomPath, pomFile, 'utf8');
        stats.finalFilesGenerated++;

        logger.info('[ReviewMerge] POM merged', {
          jobId: job.jobId,
          feature,
          sourcePoms: poms.length,
          methodsMergedOut: methodsMerged,
        });
      }

      if (specs.length > 0) {
        const { file: specFile, duplicatesRemoved } = this.mergeSpecs(feature, specs, datas);
        stats.duplicateSpecsRemoved += duplicatesRemoved;

        const specPath = path.join(finalDir, 'src', 'tests', `${feature}.spec.ts`);
        fs.writeFileSync(specPath, specFile, 'utf8');
        stats.finalFilesGenerated++;

        const mergedData = this.mergeDataFiles(datas);
        const dataPath = path.join(finalDir, 'src', 'test-data', `${feature}.data.json`);
        fs.writeFileSync(dataPath, JSON.stringify(mergedData, null, 2), 'utf8');
        stats.finalFilesGenerated++;

        logger.info('[ReviewMerge] spec merged', {
          jobId: job.jobId,
          feature,
          sourceSpecs: specs.length,
          duplicatesRemoved,
          finalTestCount: specs.flatMap((s) => s.testBlocks).length - duplicatesRemoved,
        });
      }
    }

    // ── Step 4: Scaffold project-level files ───────────────────────────────
    this.scaffoldProject(finalDir, job);

    // ── Step 5: Optional Prettier formatting ───────────────────────────────
    this.runPrettierIfAvailable(finalDir, job.jobId);

    logger.info('[ReviewMerge] merge complete', {
      jobId: job.jobId,
      ...stats,
    });

    return finalDir;
  }

  /**
   * Validates the merged final project to ensure it is complete and consistent.
   *
   * Checks that package.json, playwright.config.ts, and the src/tests directory exist.
   * Verifies that at least one `.spec.ts` file was generated.
   * Validates that every page import in every spec file resolves to an existing page file.
   *
   * @param finalDir - Absolute path to the merged final project directory.
   * @throws Error if any required file is missing or an import cannot be resolved.
   */
  validate(finalDir: string): void {
    const requiredPaths = [
      path.join(finalDir, 'package.json'),
      path.join(finalDir, 'playwright.config.ts'),
      path.join(finalDir, 'src', 'tests'),
    ];

    for (const requiredPath of requiredPaths) {
      if (!fs.existsSync(requiredPath)) {
        throw new Error(`Merged project validation failed: missing ${path.basename(requiredPath)}`);
      }
    }

    const testDir = path.join(finalDir, 'src', 'tests');
    const specFiles = fs.readdirSync(testDir).filter((file) => file.endsWith('.spec.ts'));
    if (specFiles.length === 0) {
      throw new Error('Merged project validation failed: no generated spec files found');
    }

    for (const specFile of specFiles) {
      const specPath = path.join(testDir, specFile);
      const content = fs.readFileSync(specPath, 'utf8');
      const matches = content.matchAll(/from\s+['"]\.\.\/pages\/([^'"]+)['"]/g);

      for (const match of matches) {
        const importTarget = match[1];
        const pageTs = path.join(finalDir, 'src', 'pages', `${importTarget}.ts`);
        if (!fs.existsSync(pageTs)) {
          throw new Error(
            `Merged project validation failed: ${specFile} imports missing page ${importTarget}.ts`,
          );
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Collection helpers
  // ---------------------------------------------------------------------------

  private collectPoms(srcDir: string, target: Map<string, ParsedPom[]>): void {
    const pagesDir = this.resolveSubdir(srcDir, 'pages');
    if (!fs.existsSync(pagesDir)) return;

    for (const entry of fs.readdirSync(pagesDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
      const source = fs.readFileSync(path.join(pagesDir, entry.name), 'utf8');
      const pom = parsePomSource(source);
      if (!pom) continue;

      let bucket = target.get(pom.featureKey);
      if (!bucket) {
        bucket = [];
        target.set(pom.featureKey, bucket);
      }
      bucket.push(pom);
    }
  }

  private collectSpecs(srcDir: string, target: Map<string, ParsedSpec[]>): void {
    const testsDir = this.resolveSubdir(srcDir, 'tests');
    if (!fs.existsSync(testsDir)) return;

    for (const entry of fs.readdirSync(testsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
      const source = fs.readFileSync(path.join(testsDir, entry.name), 'utf8');
      const spec = parseSpecSource(source);
      if (!spec) continue;

      const featureKey = classNameToFeatureKey(spec.className);
      let bucket = target.get(featureKey);
      if (!bucket) {
        bucket = [];
        target.set(featureKey, bucket);
      }
      bucket.push(spec);
    }
  }

  private collectData(srcDir: string, target: Map<string, ParsedDataFile[]>): void {
    const dataDir = this.resolveSubdir(srcDir, 'test-data');
    if (!fs.existsSync(dataDir)) return;

    for (const entry of fs.readdirSync(dataDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      try {
        const raw = fs.readFileSync(path.join(dataDir, entry.name), 'utf8');
        const parsed = JSON.parse(raw) as ParsedDataFile;
        // Derive feature key from the file name (e.g. login.data.json → login)
        const featureKey = entry.name.replace(/\.data\.json$/, '').replace(/\.spec$/, '');
        let bucket = target.get(featureKey);
        if (!bucket) {
          bucket = [];
          target.set(featureKey, bucket);
        }
        bucket.push(parsed);
      } catch {
        // Skip unreadable data files gracefully
      }
    }
  }

  /**
   * Copies locator JSON files into the final project, skipping exact duplicates.
   * Conflicts are resolved by appending the childId so no data is lost.
   */
  private copyLocators(srcDir: string, finalDir: string, childId: string): void {
    const locatorsDir = this.resolveSubdir(srcDir, 'locators');
    if (!fs.existsSync(locatorsDir)) return;

    const destDir = path.join(finalDir, 'src', 'locators');

    for (const entry of fs.readdirSync(locatorsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;

      const srcPath = path.join(locatorsDir, entry.name);
      const destPath = path.join(destDir, entry.name);

      if (fs.existsSync(destPath)) {
        const existing = fs.readFileSync(destPath, 'utf8');
        const incoming = fs.readFileSync(srcPath, 'utf8');
        if (existing === incoming) continue;
        // Conflict: use childId-suffixed name
        const ext = path.extname(entry.name);
        const base = path.basename(entry.name, ext);
        fs.copyFileSync(srcPath, path.join(destDir, `${base}.${childId}${ext}`));
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Merge helpers
  // ---------------------------------------------------------------------------

  /**
   * Merges all POM files for a feature into a single source string.
   *
   * Deduplication strategy for methods:
   *  - If two methods share the same name, keep the one with the higher-priority
   *    locator strategy (getByTestId > getByRole > getByLabel > …).
   *  - Ties are broken by keeping the first seen.
   */
  private mergePoms(
    featureKey: string,
    poms: ParsedPom[],
  ): { file: string; methodsMerged: number } {
    const className = featureKeyToClassName(featureKey);

    // Pick route path from the first POM that has a non-trivial route
    const routePath = poms.find((p) => p.routePath && p.routePath !== '/')?.routePath
      ?? poms[0]?.routePath
      ?? '/';

    // Deduplicate methods: name → best (highest locator priority) ParsedMethod
    const methodMap = new Map<string, ParsedMethod>();
    let methodsMerged = 0;

    for (const pom of poms) {
      for (const method of pom.methods) {
        const existing = methodMap.get(method.name);
        if (!existing) {
          methodMap.set(method.name, method);
        } else {
          methodsMerged++;
          if (locatorPriority(method.locatorStrategy) > locatorPriority(existing.locatorStrategy)) {
            methodMap.set(method.name, method);
          }
        }
      }
    }

    const methodsBlock = Array.from(methodMap.values())
      .map((m) => m.body)
      .join('\n\n');

    const file = `import { type Page } from '@playwright/test';
import { waitForPageLoad } from '../utils/wait.util';

export class ${className} {
  constructor(private readonly page: Page) {}

${methodsBlock}

  async goto(): Promise<void> {
    await this.page.goto(${JSON.stringify(routePath)});
    await waitForPageLoad(this.page);
  }
}
`;

    return { file, methodsMerged };
  }

  /**
   * Merges all spec files for a feature into a single source string.
   *
   * Deduplication: test blocks with identical titles are collapsed to one
   * (the first occurrence is kept).
   */
  private mergeSpecs(
    featureKey: string,
    specs: ParsedSpec[],
    _datas: ParsedDataFile[],
  ): { file: string; duplicatesRemoved: number } {
    const className = featureKeyToClassName(featureKey);
    const pageVarName = lcFirst(className);
    const dataVarName = `${featureKey.replace(/-/g, '')}Data`;

    const seenTitles = new Set<string>();
    const uniqueBlocks: string[] = [];
    let duplicatesRemoved = 0;

    for (const spec of specs) {
      for (const block of spec.testBlocks) {
        if (seenTitles.has(block.title)) {
          duplicatesRemoved++;
          continue;
        }
        seenTitles.add(block.title);

        // Rewrite the test block to use the canonical variable names
        const rewritten = this.rewriteTestBlock(
          block.body,
          spec.className,
          className,
          spec.dataVarName,
          dataVarName,
          lcFirst(spec.className),
          pageVarName,
        );
        uniqueBlocks.push(rewritten);
      }
    }

    const file = `import { test, expect } from '@playwright/test';
import { ${className} } from '../pages/${className}';
import ${dataVarName} from '../test-data/${featureKey}.data.json';

${uniqueBlocks.join('\n\n')}
`;

    return { file, duplicatesRemoved };
  }

  /**
   * Rewrites class names and variable names in a test block to use the merged
   * canonical class/var names from the ReviewMergeService.
   */
  private rewriteTestBlock(
    body: string,
    oldClass: string,
    newClass: string,
    oldDataVar: string,
    newDataVar: string,
    oldPageVar: string,
    newPageVar: string,
  ): string {
    return body
      .replaceAll(oldClass, newClass)
      .replaceAll(oldDataVar, newDataVar)
      .replaceAll(oldPageVar, newPageVar);
  }

  /**
   * Shallow-merges an array of test-data JSON objects.
   * For nested objects (e.g. `validUser`), the first non-empty value wins.
   */
  private mergeDataFiles(datas: ParsedDataFile[]): ParsedDataFile {
    const merged: ParsedDataFile = {};
    for (const data of datas) {
      for (const [key, value] of Object.entries(data)) {
        if (!(key in merged) || (merged[key] === null || merged[key] === '')) {
          merged[key] = value;
        } else if (
          typeof merged[key] === 'object' &&
          merged[key] !== null &&
          typeof value === 'object' &&
          value !== null
        ) {
          // Shallow merge nested objects (e.g. validUser, inputs)
          merged[key] = { ...(merged[key] as Record<string, unknown>), ...(value as Record<string, unknown>) };
        }
      }
    }
    return merged;
  }

  // ---------------------------------------------------------------------------
  // Scaffolding
  // ---------------------------------------------------------------------------

  private scaffoldProject(finalDir: string, job: JobEntity): void {
    const pkgJson = {
      name: 'generated-playwright-project',
      version: '1.0.0',
      private: true,
      scripts: {
        test: 'npx playwright test',
        'test:headed': 'npx playwright test --headed',
        'show-report': 'npx playwright show-report',
      },
      devDependencies: {
        '@playwright/test': '1.59.1',
        typescript: '^5.3.3',
      },
    };
    fs.writeFileSync(path.join(finalDir, 'package.json'), JSON.stringify(pkgJson, null, 2), 'utf8');

    const screenshot = job.screenshotOnFailure ? "'only-on-failure'" : "'off'";
    const trace = job.traceOnFailure ? "'retain-on-failure'" : "'off'";
    const video = job.videoOnFailure ? "'retain-on-failure'" : "'off'";

    const playwrightConfig = `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src/tests',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: ${job.retryCount},
  workers: 1,
  reporter: [['html', { open: 'never' }], ['line']],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:4000',
    headless: ${job.headless},
    screenshot: ${screenshot},
    trace: ${trace},
    video: ${video},
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
`;
    fs.writeFileSync(path.join(finalDir, 'playwright.config.ts'), playwrightConfig, 'utf8');

    const tsConfig = {
      compilerOptions: {
        target: 'ES2022',
        module: 'CommonJS',
        moduleResolution: 'node',
        strict: true,
        esModuleInterop: true,
        resolveJsonModule: true,
        skipLibCheck: true,
      },
      include: ['src/**/*'],
    };
    fs.writeFileSync(
      path.join(finalDir, 'tsconfig.json'),
      JSON.stringify(tsConfig, null, 2),
      'utf8',
    );

    const waitUtil = `import type { Page } from '@playwright/test';

export async function waitForPageLoad(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
}
`;
    fs.writeFileSync(path.join(finalDir, 'src', 'utils', 'wait.util.ts'), waitUtil, 'utf8');

    const readme = `# Generated Playwright Project

Auto-generated by the AI QA Automation Platform.

## Setup

\`\`\`bash
npm install
npx playwright install
\`\`\`

## Run Tests

\`\`\`bash
BASE_URL=http://localhost:4000 npx playwright test
\`\`\`

## View Report

\`\`\`bash
npm run show-report
\`\`\`

## Project Structure

\`\`\`
.
├── src/
│   ├── pages/      # Page Object Models (one per feature)
│   ├── tests/      # Playwright spec files (one per feature)
│   ├── locators/   # Resolved locator snapshots
│   ├── test-data/  # Externalised test data (one JSON per feature)
│   ├── utils/      # Shared utilities
│   └── fixtures/   # Test fixtures
├── reports/        # Execution reports
├── playwright.config.ts
├── tsconfig.json
└── package.json
\`\`\`
`;
    fs.writeFileSync(path.join(finalDir, 'README.md'), readme, 'utf8');
  }

  // ---------------------------------------------------------------------------
  // Optional Prettier formatting
  // ---------------------------------------------------------------------------

  /**
   * Runs `npx prettier --write src/` on the generated project.
   *
   * Failures are swallowed with a warning log so a missing/unavailable
   * Prettier installation never causes the job to fail.
   */
  private runPrettierIfAvailable(finalDir: string, jobId: string): void {
    try {
      // Only attempt formatting when prettier is discoverable in the platform runtime
      const { execSync } = require('child_process') as typeof import('child_process');
      execSync('npx --no prettier --version', { stdio: 'ignore', timeout: 5_000 });
      execSync('npx --no prettier --write "src/**/*.ts"', {
        cwd: finalDir,
        stdio: 'pipe',
        timeout: 30_000,
      });
      logger.info('[ReviewMerge] Prettier formatting applied', { jobId });
    } catch {
      logger.warn('[ReviewMerge] Prettier not available or failed — skipping format step', { jobId });
    }
  }

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  private ensureProjectDirs(finalDir: string): void {
    for (const dir of [
      'src/pages',
      'src/tests',
      'src/locators',
      'src/test-data',
      'src/utils',
      'src/fixtures',
      'reports',
    ]) {
      fs.mkdirSync(path.join(finalDir, dir), { recursive: true });
    }
  }

  private resolveSubdir(srcDir: string, section: string): string {
    const srcBased = path.join(srcDir, 'src', section);
    return fs.existsSync(srcBased) ? srcBased : path.join(srcDir, section);
  }
}
