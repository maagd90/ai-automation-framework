import fs from 'fs';
import path from 'path';
import { JOBS_BASE_DIR, REPO_ROOT_DIR } from '../../config';
import { runtimeConfig } from '../../config/runtime.config';
import type { JobEntity } from '../../domain/Job';
import { logger } from '../../utils/logger';
import { createNodeModulesLink, removeNodeModulesLink } from './FinalProjectRuntimeLinker';
import { ArtifactNormalizer } from './ArtifactNormalizer';
import { FrameworkQualityGate } from './FrameworkQualityGate';
import { FrameworkSelfRepairLoop } from './FrameworkSelfRepairLoop';
import { TestDataMergeService } from './TestDataMergeService';

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
// Locator JSON file types (for merged locator snapshots)
// ---------------------------------------------------------------------------

/** A single entry inside a locator JSON snapshot file. */
export interface LocatorEntry {
  /** Camel-case field name, e.g. `usernameInput` */
  name: string;
  /** Human-readable description of what the locator targets */
  target?: string;
  /** Playwright selector expression, e.g. `page.getByPlaceholder('Username')` */
  selector: string;
  /** Locator strategy used (e.g. `getByPlaceholder`, `getByRole`, `data-testid`) */
  strategy: string;
  /** Confidence score [0, 1] assigned by the generator */
  confidenceScore: number;
  /** Alternative locators to fall back to if the primary fails */
  fallbackLocators?: LocatorEntry[];
}

/** Root structure of a merged locator JSON file. */
export interface LocatorFile {
  feature: string;
  pageObject?: string;
  locators: LocatorEntry[];
}

/**
 * Strategy priority for locator JSON files.
 * Higher value = preferred when confidence scores tie.
 * Ordered per spec: data-testid > getByTestId > getByRole > getByLabel >
 * getByPlaceholder > getByText > css/xpath/nth.
 *
 * Both `data-testid` (attribute string) and `getByTestId` (method name) are
 * accepted; `data-testid` is ranked higher as it is the more explicit form.
 */
const LOCATOR_JSON_STRATEGY_PRIORITY: Record<string, number> = {
  'data-testid': 6,
  getByTestId: 5,
  getByRole: 4,
  getByLabel: 3,
  getByPlaceholder: 2,
  getByText: 1,
};

function locatorJsonStrategyPriority(strategy: string): number {
  return LOCATOR_JSON_STRATEGY_PRIORITY[strategy] ?? 0;
}

/**
 * Derives a feature key from a locator JSON file name.
 *
 * Strips known suffixes (`.locators.json`, `.json`) then applies the same
 * PascalCase → kebab-case conversion used elsewhere in this service.
 *
 * Examples:
 *   `login.locators.json`  → `login`
 *   `LoginPage.json`       → `login`
 *   `checkout.json`        → `checkout`
 */
function featureKeyFromLocatorFileName(filename: string): string {
  const base = filename.replace(/\.locators\.json$/, '').replace(/\.json$/, '');
  if (/^[A-Z]/.test(base)) return classNameToFeatureKey(base);
  return base.toLowerCase();
}

/**
 * Merges an array of {@link LocatorEntry} records from multiple child outputs.
 *
 * Deduplication rules (applied in order):
 *  1. Group by `name` field.
 *  2. Keep the entry with the highest `confidenceScore`.
 *  3. On a tie, keep the entry with the higher strategy priority
 *     (data-testid > getByRole > getByLabel > getByPlaceholder > getByText > other).
 *  4. On a further tie, keep the first-seen entry.
 *
 * @param entries - All locator entries collected across child outputs.
 * @returns Deduplicated, priority-ordered locator entries.
 */
export function mergeLocatorEntries(entries: LocatorEntry[]): LocatorEntry[] {
  const byName = new Map<string, LocatorEntry>();

  for (const entry of entries) {
    const key = entry.name || entry.target || entry.selector;
    if (!key) continue;

    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, entry);
      continue;
    }

    const incomingConf = entry.confidenceScore ?? 0;
    const existingConf = existing.confidenceScore ?? 0;

    if (incomingConf > existingConf) {
      byName.set(key, entry);
    } else if (
      incomingConf === existingConf &&
      locatorJsonStrategyPriority(entry.strategy) > locatorJsonStrategyPriority(existing.strategy)
    ) {
      byName.set(key, entry);
    }
  }

  return Array.from(byName.values());
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
 *
 * Bug fix: we first locate the `=>` arrow operator after the title match, then
 * find the `{` that follows it. This ensures we track the arrow function body's
 * opening brace rather than the parameter destructuring brace `{ page }`, which
 * would cause the depth counter to exit prematurely and truncate the body.
 *
 * Exported for unit testing.
 */
export function extractTestBlocks(source: string): ParsedTestBlock[] {
  const blocks: ParsedTestBlock[] = [];
  // Match `test("...",` or `test('...',`
  const titlePattern = /^test\((["'`])([\s\S]*?)\1,/gm;
  let match: RegExpExecArray | null;

  while ((match = titlePattern.exec(source)) !== null) {
    const title = `${match[1]}${match[2]}${match[1]}`;

    // Locate the `=>` arrow operator after the title, then find the `{` that
    // opens the arrow function body (not the destructured parameter list).
    const searchFrom = match.index + match[0].length;
    const arrowIdx = source.indexOf('=>', searchFrom);
    if (arrowIdx === -1) continue;
    const arrowStart = source.indexOf('{', arrowIdx + 2);
    if (arrowStart === -1) continue;

    // Walk forward tracking brace depth to find the closing `}` of the body.
    let depth = 1;
    let i = arrowStart + 1;
    while (i < source.length && depth > 0) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') depth--;
      i++;
    }

    // Include the closing `);` that terminates the test() call.
    // If no `);` immediately follows (e.g. no trailing semicolon), use `i`.
    const closingEnd = source.indexOf(');', i);
    // Guard: only accept `);` within a short distance to avoid grabbing a `);`
    // from a completely unrelated expression deep in the file.
    const bodyEnd =
      closingEnd !== -1 && closingEnd - i <= MAX_CLOSING_DISTANCE ? closingEnd + 2 : i;
    const body = source.slice(match.index, bodyEnd).trim();
    blocks.push({ title, body });
  }

  return blocks;
}

/**
 * Maximum number of whitespace/newline characters that can appear between the
 * arrow-function body's closing `}` and the test call's terminating `);`.
 *
 * In standard Playwright spec format the sequence is `});\n`, so a gap of up to
 * 4 characters (e.g. `\r\n`) is acceptable. Anything larger indicates the next
 * `);` belongs to an unrelated expression inside the file.
 */
const MAX_CLOSING_DISTANCE = 4;

/**
 * Maximum number of characters of tsc error output to include in the thrown
 * Error message. Keeps the error concise while still showing the first failure.
 */
const MAX_TSC_ERROR_OUTPUT_LENGTH = 2000;

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
// Data reconciliation helper (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Reconciles the merged test-data JSON against the generated spec source to
 * ensure every property path referenced in the spec actually exists in the
 * data object.
 *
 * Scans for patterns like `dataVarName.topKey` and
 * `dataVarName.topKey.nestedKey`, then inserts empty-string placeholders for
 * any missing paths so that `tsc --noEmit` does not raise TS2339 errors.
 *
 * Example:
 *   spec references `homeData.validUser.username` and `homeData.validUser.password`
 *   but the merged data only has `{ validUser: { password: "..." } }`.
 *   After reconcile: `{ validUser: { password: "...", username: "" } }`.
 */
export function reconcileSpecDataReferences(
  specSource: string,
  dataVarName: string,
  mergedData: Record<string, unknown>,
): Record<string, unknown> {
  // Match dataVarName.topKey, dataVarName.topKey.nestedKey, and the optional-
  // chaining variants dataVarName.topKey?.nestedKey.  The inner `\??` makes
  // the literal `?` character optional so both `.` and `?.` are handled.
  const pattern = new RegExp(`\\b${dataVarName}\\.(\\w+)(?:\\??\\.(\\w+))?`, 'g');
  let match: RegExpExecArray | null;
  const updated: Record<string, unknown> = JSON.parse(JSON.stringify(mergedData)) as Record<string, unknown>;

  while ((match = pattern.exec(specSource)) !== null) {
    const topKey = match[1];
    const nestedKey = match[2];

    if (nestedKey) {
      // Two-level access: dataVar.topKey.nestedKey  or  dataVar.topKey?.nestedKey
      if (
        !updated[topKey] ||
        typeof updated[topKey] !== 'object' ||
        updated[topKey] === null
      ) {
        updated[topKey] = {};
      }
      const obj = updated[topKey] as Record<string, unknown>;
      if (!(nestedKey in obj)) {
        obj[nestedKey] = '';
      }
    } else {
      // One-level access: dataVar.topKey
      if (!(topKey in updated)) {
        updated[topKey] = '';
      }
    }
  }

  return updated;
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
  locatorFilesGenerated: number;
  lowConfidenceLocators: number;
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
  private readonly artifactNormalizer = new ArtifactNormalizer();
  private readonly testDataMergeService = new TestDataMergeService();
  private readonly qualityGate = new FrameworkQualityGate();
  private readonly selfRepairLoop = new FrameworkSelfRepairLoop();

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
      locatorFilesGenerated: 0,
      lowConfidenceLocators: 0,
    };

    // ── Step 1: Collect all child artefacts ────────────────────────────────
    const pomsByFeature = new Map<string, ParsedPom[]>();
    const specsByFeature = new Map<string, ParsedSpec[]>();
    const dataByFeature = new Map<string, ParsedDataFile[]>();
    const locatorsByFeature = new Map<string, LocatorEntry[]>();

    for (const childId of childIds) {
      const srcDir = path.join(JOBS_BASE_DIR, job.jobId, 'children', childId, 'generated');
      if (!fs.existsSync(srcDir)) continue;

      const normalizedArtifacts = this.artifactNormalizer.normalizeChildOutput(srcDir);
      if (normalizedArtifacts.length === 0) continue;
      stats.childOutputsReceived++;

      for (const artifact of normalizedArtifacts) {
        if (artifact.page) {
          const pageBucket = pomsByFeature.get(artifact.feature) ?? [];
          pageBucket.push({
            className: artifact.page.className,
            featureKey: artifact.feature,
            routePath: artifact.page.routePath,
            methods: artifact.page.methods,
          });
          pomsByFeature.set(artifact.feature, pageBucket);
        }

        if (artifact.specs.length > 0) {
          const specBucket = specsByFeature.get(artifact.feature) ?? [];
          specBucket.push({
            className: featureKeyToClassName(artifact.feature),
            dataVarName: `${artifact.feature.replace(/-/g, '')}Data`,
            specName: artifact.feature,
            testBlocks: artifact.specs.map((spec) => ({
              title: JSON.stringify(spec.title),
              body: spec.body,
            })),
          });
          specsByFeature.set(artifact.feature, specBucket);
        }

        if (Object.keys(artifact.testData).length > 0) {
          const dataBucket = dataByFeature.get(artifact.feature) ?? [];
          dataBucket.push(artifact.testData);
          dataByFeature.set(artifact.feature, dataBucket);
        }

        if (artifact.locators.length > 0) {
          const locatorBucket = locatorsByFeature.get(artifact.feature) ?? [];
          locatorBucket.push(...artifact.locators);
          locatorsByFeature.set(artifact.feature, locatorBucket);
        }
      }
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

    // ── Step 2b: Write merged locator files ────────────────────────────────
    this.writeLocatorFiles(finalDir, locatorsByFeature, stats, job.jobId);

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
    this.selfRepairLoop.run(finalDir, () => this.qualityGate.validate(finalDir, (dir) => this.runTscValidation(dir)));
  }

  /**
   * Runs `tsc --noEmit` to validate the generated project's TypeScript syntax.
   *
   * When INSTALL_GENERATED_PROJECT_DEPS=false (the default), the generated project
   * has no node_modules of its own, so `npx tsc` inside that directory would fail.
   * In that case we resolve the `tsc` binary from the platform's node_modules and
   * run it from the repo root so the platform's type declarations are available.
   *
   * When INSTALL_GENERATED_PROJECT_DEPS=true, the generated project has its own
   * node_modules, so we can invoke `npx tsc` directly from the project directory.
   *
   * @throws Error if tsc reports any diagnostics.
   */
  private runTscValidation(finalDir: string): void {
    // When INSTALL_GENERATED_PROJECT_DEPS=false the generated project has no
    // node_modules of its own.  TypeScript's module resolution walks the directory
    // tree upward from the source files; because the project lives under /tmp it
    // never reaches REPO_ROOT_DIR/node_modules.  We create a temporary symlink
    // final-project/node_modules -> REPO_ROOT_DIR/node_modules so that tsc (and
    // Playwright) can resolve @playwright/test without a full npm install.
    const symlinkCreated =
      !runtimeConfig.INSTALL_GENERATED_PROJECT_DEPS && createNodeModulesLink(finalDir);

    try {
      const { execSync, execFileSync } = require('child_process') as typeof import('child_process');
      const tsConfigPath = path.join(finalDir, 'tsconfig.json');

      if (!runtimeConfig.INSTALL_GENERATED_PROJECT_DEPS) {
        // Resolve tsc from the platform node_modules.
        const platformTsc = path.join(REPO_ROOT_DIR, 'node_modules', '.bin', 'tsc');
        let tscBin: string;
        if (fs.existsSync(platformTsc)) {
          tscBin = platformTsc;
        } else {
          logger.warn('[ReviewMerge] Platform tsc not found, falling back to system tsc', {
            expected: platformTsc,
          });
          tscBin = 'tsc';
        }
        logger.info('[ReviewMerge] Running TypeScript validation via platform tsc', {
          tscBin,
          tsConfigPath,
        });
        // Run from finalDir so TypeScript resolves node_modules relative to the project
        // (which now has the symlink pointing at the platform's node_modules).
        // Use execFileSync with an explicit args array to avoid shell metacharacter injection.
        execFileSync(tscBin, ['--noEmit', '--project', tsConfigPath, '--skipLibCheck'], {
          cwd: finalDir,
          stdio: 'pipe',
          timeout: 30_000,
        });
      } else {
        execSync(`npx tsc --noEmit --project "${tsConfigPath}" --skipLibCheck`, {
          cwd: finalDir,
          stdio: 'pipe',
          timeout: 30_000,
        });
      }

      logger.info('[ReviewMerge] TypeScript validation passed', { finalDir });
    } catch (err: unknown) {
      const output =
        (err instanceof Error && 'stdout' in err
          ? String((err as NodeJS.ErrnoException & { stdout?: Buffer }).stdout)
          : '') ||
        (err instanceof Error ? err.message : String(err));
      throw new Error(
        `Generated project TypeScript validation failed. The spec files contain syntax errors:\n${output.slice(0, MAX_TSC_ERROR_OUTPUT_LENGTH)}`,
      );
    } finally {
      // Always remove the temporary symlink so it isn't included in the ZIP.
      if (symlinkCreated) {
        removeNodeModulesLink(finalDir);
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
   * Collects locator JSON files from a single child's output directory into a
   * feature-keyed accumulator map.
   *
   * The feature key is derived from the file name using
   * {@link featureKeyFromLocatorFileName}, or falls back to the `feature` field
   * inside the JSON if present.
   *
   * @param srcDir - Root of a child agent's generated output.
   * @param target - Accumulator: feature key → all raw {@link LocatorEntry} arrays.
   */
  private collectLocators(srcDir: string, target: Map<string, LocatorEntry[]>): void {
    const locatorsDir = this.resolveSubdir(srcDir, 'locators');
    if (!fs.existsSync(locatorsDir)) return;

    for (const entry of fs.readdirSync(locatorsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;

      try {
        const raw = fs.readFileSync(path.join(locatorsDir, entry.name), 'utf8');
        const parsed = JSON.parse(raw) as Partial<LocatorFile>;
        if (!Array.isArray(parsed.locators)) continue;

        const featureKey =
          (typeof parsed.feature === 'string' && parsed.feature) ||
          featureKeyFromLocatorFileName(entry.name);

        let bucket = target.get(featureKey);
        if (!bucket) {
          bucket = [];
          target.set(featureKey, bucket);
        }
        bucket.push(...parsed.locators);
      } catch {
        // Skip unreadable / malformed locator files gracefully
      }
    }
  }

  /**
   * Merges collected locator entries per feature and writes one clean
   * `<feature>.locators.json` file per feature into `final-project/src/locators/`.
   *
   * Each file uses the schema defined by {@link LocatorFile}.  Duplicates are
   * removed using {@link mergeLocatorEntries}.
   *
   * Locators with `confidenceScore < 0.5` are counted as low-confidence in stats.
   *
   * @param finalDir - Absolute path to the assembled final project.
   * @param locatorsByFeature - Feature key → raw entries collected from all children.
   * @param stats - Mutable stats object updated in place.
   * @param jobId - Used for structured logging only.
   */
  private writeLocatorFiles(
    finalDir: string,
    locatorsByFeature: Map<string, LocatorEntry[]>,
    stats: MergeStats,
    jobId: string,
  ): void {
    const LOW_CONFIDENCE_THRESHOLD = 0.5;
    const destDir = path.join(finalDir, 'src', 'locators');

    const sourceFileCount = Array.from(locatorsByFeature.values()).reduce(
      (sum, entries) => sum + entries.length,
      0,
    );

    logger.info('[ReviewMerge] locator files found', {
      jobId,
      sourceLocatorFiles: sourceFileCount,
      featuresWithLocators: locatorsByFeature.size,
    });

    for (const [feature, rawEntries] of locatorsByFeature) {
      const before = rawEntries.length;
      const merged = mergeLocatorEntries(rawEntries);
      const removed = before - merged.length;
      stats.duplicateLocatorsRemoved += removed;

      const lowConf = merged.filter((e) => (e.confidenceScore ?? 1) < LOW_CONFIDENCE_THRESHOLD);
      stats.lowConfidenceLocators += lowConf.length;

      const pageObject = featureKeyToClassName(feature);
      const locatorFile: LocatorFile = { feature, pageObject, locators: merged };

      const outPath = path.join(destDir, `${feature}.locators.json`);
      fs.writeFileSync(outPath, JSON.stringify(locatorFile, null, 2), 'utf8');
      stats.locatorFilesGenerated++;

      logger.info('[ReviewMerge] locators merged', {
        jobId,
        feature,
        rawEntries: before,
        duplicatesRemoved: removed,
        finalLocatorCount: merged.length,
        lowConfidenceCount: lowConf.length,
      });
    }

    logger.info('[ReviewMerge] locator files generated', {
      jobId,
      locatorFilesGenerated: stats.locatorFilesGenerated,
      duplicateLocatorsRemoved: stats.duplicateLocatorsRemoved,
      lowConfidenceLocators: stats.lowConfidenceLocators,
    });
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
      .map((m) => m.body);

    const usedFieldNames = new Set<string>();
    const locatorFieldLines: string[] = [];
    const renderedMethods: string[] = methodsBlock.map((methodBody) => {
      const extraction = this.extractLocatorExpression(methodBody);
      if (!extraction) return methodBody;

      const baseField = this.toLocatorFieldName(extraction.methodNameHint);
      let fieldName = baseField;
      let index = 2;
      while (usedFieldNames.has(fieldName)) {
        fieldName = `${baseField}${index++}`;
      }
      usedFieldNames.add(fieldName);
      locatorFieldLines.push(`  private readonly ${fieldName} = ${extraction.locatorExpression};`);
      return methodBody.replace(extraction.locatorExpression, `this.${fieldName}`);
    });

    const methodNames = Array.from(methodMap.keys());
    if (
      methodNames.includes('enterUsername')
      && methodNames.includes('enterPassword')
      && methodNames.includes('clickLogin')
      && !methodNames.includes('login')
    ) {
      renderedMethods.push(`  async login(username: string, password: string): Promise<void> {
    await this.enterUsername(username);
    await this.enterPassword(password);
    await this.clickLogin();
  }`);
    }

    const fieldsBlock = locatorFieldLines.length > 0 ? `${locatorFieldLines.join('\n')}\n\n` : '';
    const file = `import { type Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class ${className} extends BasePage {
  constructor(page: Page) {
    super(page);
  }

${fieldsBlock}${renderedMethods.join('\n\n')}

  async goto(): Promise<void> {
    await this.gotoPath(${JSON.stringify(routePath)});
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
   * For nested objects (e.g. `validUser`), fields are combined so no key is lost.
   */
  private mergeDataFiles(datas: ParsedDataFile[]): ParsedDataFile {
    return this.testDataMergeService.merge(datas);
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
        'test:allure': 'npx playwright test --reporter=line,html,allure-playwright',
        'allure:generate': 'npx allure generate allure-results --clean -o allure-report',
        'allure:open': 'npx allure open allure-report',
        'show-report': 'npx playwright show-report',
      },
      devDependencies: {
        '@playwright/test': '1.59.1',
        'allure-playwright': '^3.0.0',
        'allure-commandline': '^2.30.0',
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
  reporter: [
    ['line'],
    ['html', { open: 'never' }],
    ['allure-playwright'],
  ],
  use: {
    baseURL: process.env.BASE_URL || ${JSON.stringify(job.url)},
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

    const basePage = `import { type Page } from '@playwright/test';
import { waitForPageLoad } from '../utils/wait.util';

export abstract class BasePage {
  protected constructor(protected readonly page: Page) {}

  protected async gotoPath(pathname: string): Promise<void> {
    await this.page.goto(pathname);
    await waitForPageLoad(this.page);
  }
}
`;
    fs.writeFileSync(path.join(finalDir, 'src', 'pages', 'BasePage.ts'), basePage, 'utf8');

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
BASE_URL=${job.url} npm test
\`\`\`

## View Playwright HTML Report

\`\`\`bash
npm run show-report
\`\`\`

## Allure Report

This project is preconfigured with Allure reporting.

Run tests (Allure results are written to \`allure-results/\` automatically):

\`\`\`bash
npm test
\`\`\`

Generate Allure HTML report:

\`\`\`bash
npm run allure:generate
\`\`\`

Open Allure report in browser:

\`\`\`bash
npm run allure:open
\`\`\`

Allure results are generated under \`allure-results/\` and the HTML report under \`allure-report/\`.

## Project Structure

\`\`\`
.
├── src/
│   ├── pages/         # Page Object Models (one per feature)
│   ├── tests/         # Playwright spec files (one per feature)
│   ├── locators/      # Resolved locator snapshots
│   ├── test-data/     # Externalised test data (one JSON per feature)
│   ├── utils/         # Shared utilities
│   └── fixtures/      # Test fixtures
├── reports/           # Execution reports
├── allure-results/    # Raw Allure test results (generated at runtime)
├── allure-report/     # Allure HTML report (generated via npm run allure:generate)
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
      // Attempt to use the prettier binary from the platform's node_modules.
      // Fall back silently if prettier is not installed.
      const { execSync } = require('child_process') as typeof import('child_process');
      execSync('npx prettier --version', { stdio: 'ignore', timeout: 5_000 });
      execSync('npx prettier --write "src/**/*.ts"', {
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

  private extractLocatorExpression(methodBody: string): { locatorExpression: string; methodNameHint: string } | null {
    const signatureMatch = methodBody.match(/async (\w+)\(/);
    const methodNameHint = signatureMatch?.[1] ?? 'element';
    const actionPattern = /await\s+(this\.page\.[\s\S]*?)\.(fill|click|waitFor|selectOption|check|uncheck|innerText)\(/;
    const match = methodBody.match(actionPattern);
    if (!match?.[1]) return null;
    return { locatorExpression: match[1].trim(), methodNameHint };
  }

  private toLocatorFieldName(methodName: string): string {
    const stripped = methodName
      .replace(/^(enter|click|select|check|uncheck|verify|expect|get|set)/i, '')
      .replace(/(Visible|Text|Value|Field|Button)$/i, '');
    const base = stripped.charAt(0).toLowerCase() + stripped.slice(1);
    return `${base || 'element'}Locator`;
  }
}
