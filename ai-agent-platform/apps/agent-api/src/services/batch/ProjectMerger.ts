import fs from 'fs';
import path from 'path';
import { JOBS_BASE_DIR } from '../../config';
import type { JobEntity } from '../../domain/Job';

type RenameMap = Map<string, string>;

/**
 * Merges the generated outputs of all child agent runs into a single deployable Playwright project.
 *
 * Each child agent produces its own pages, tests, locators, and test-data directories.
 * ProjectMerger combines these into a unified `final-project/` directory with a standardized
 * structure, resolving file name conflicts by appending the childId as a suffix.
 * It also scaffolds the project-level files: package.json, playwright.config.ts, tsconfig.json,
 * a wait utility, and a README.
 */
export class ProjectMerger {
  /**
   * Merges all child agent outputs into a single final project directory.
   *
   * Creates the standard directory structure (src/pages, src/tests, src/locators,
   * src/test-data, src/utils, src/fixtures, reports), copies files from each child,
   * resolves naming conflicts, updates import paths in spec files, and scaffolds
   * project-level configuration files.
   *
   * @param job - The job entity (provides jobId and per-job execution settings).
   * @param childIds - Ordered list of child run identifiers whose outputs should be merged.
   * @returns Absolute path to the merged final project directory.
   */
  merge(job: JobEntity, childIds: string[]): string {
    const finalDir = path.join(JOBS_BASE_DIR, job.jobId, 'final-project');
    fs.rmSync(finalDir, { recursive: true, force: true });
    fs.mkdirSync(finalDir, { recursive: true });

    this.ensureProjectDirs(finalDir);

    for (const childId of childIds) {
      const srcDir = path.join(JOBS_BASE_DIR, job.jobId, 'children', childId, 'generated');
      if (!fs.existsSync(srcDir)) continue;

      const childPagesDir = this.resolveChildSubdir(srcDir, 'pages');
      const childTestsDir = this.resolveChildSubdir(srcDir, 'tests');
      const childLocatorsDir = this.resolveChildSubdir(srcDir, 'locators');
      const childDataDir = this.resolveChildSubdir(srcDir, 'test-data');

      const pageRenames = this.copyTypedFiles(
        childPagesDir,
        path.join(finalDir, 'src', 'pages'),
        childId,
      );
      this.copyTests(childTestsDir, path.join(finalDir, 'src', 'tests'), childId, pageRenames);
      this.copyTypedFiles(childLocatorsDir, path.join(finalDir, 'src', 'locators'), childId);
      this.copyTypedFiles(childDataDir, path.join(finalDir, 'src', 'test-data'), childId);
    }

    this.scaffoldProject(finalDir, job);

    return finalDir;
  }

  /**
   * Validates the merged final project to ensure it is complete and consistent.
   *
   * Checks that package.json, playwright.config.ts, and the src/tests directory exist.
   * Verifies that at least one `.spec.ts` file was generated.
   * Validates that every page import in every spec file resolves to an existing page file.
   * Throws an error describing the first missing or inconsistent artifact found.
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

  private copyTypedFiles(srcDir: string, destDir: string, childId: string): RenameMap {
    const renames: RenameMap = new Map();
    if (!fs.existsSync(srcDir)) return renames;

    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;

      const srcPath = path.join(srcDir, entry.name);
      const existingPath = path.join(destDir, entry.name);
      if (fs.existsSync(existingPath)) {
        const existingContent = fs.readFileSync(existingPath, 'utf8');
        const incomingContent = fs.readFileSync(srcPath, 'utf8');
        if (existingContent === incomingContent) {
          renames.set(entry.name, entry.name);
          continue;
        }
      }

      const destName = this.resolveUniqueName(destDir, entry.name, childId);
      fs.copyFileSync(srcPath, path.join(destDir, destName));
      renames.set(entry.name, destName);
    }

    return renames;
  }

  private copyTests(srcDir: string, destDir: string, childId: string, pageRenames: RenameMap): void {
    if (!fs.existsSync(srcDir)) return;

    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;

      const srcPath = path.join(srcDir, entry.name);
      const destName = this.resolveUniqueName(destDir, entry.name, childId);
      let content = fs.readFileSync(srcPath, 'utf8');

      for (const [originalName, renamedName] of pageRenames.entries()) {
        const originalImportBase = path.basename(originalName, '.ts');
        const renamedImportBase = path.basename(renamedName, '.ts');

        content = content
          .replaceAll(`../pages/${originalImportBase}.js`, `../pages/${renamedImportBase}`)
          .replaceAll(`../pages/${originalImportBase}`, `../pages/${renamedImportBase}`);
      }

      fs.writeFileSync(path.join(destDir, destName), content, 'utf8');
    }
  }

  private resolveChildSubdir(srcDir: string, section: string): string {
    const srcBased = path.join(srcDir, 'src', section);
    const legacy = path.join(srcDir, section);
    return fs.existsSync(srcBased) ? srcBased : legacy;
  }

  private resolveUniqueName(destDir: string, fileName: string, childId: string): string {
    const ext = path.extname(fileName);
    const base = path.basename(fileName, ext);
    let candidate = fileName;

    if (!fs.existsSync(path.join(destDir, candidate))) {
      return candidate;
    }

    candidate = `${base}.${childId}${ext}`;
    let counter = 2;
    while (fs.existsSync(path.join(destDir, candidate))) {
      candidate = `${base}.${childId}.${counter}${ext}`;
      counter += 1;
    }

    return candidate;
  }

  private ensureProjectDirs(finalDir: string): void {
    for (const dir of ['src/pages', 'src/tests', 'src/locators', 'src/test-data', 'src/utils', 'src/fixtures', 'reports']) {
      fs.mkdirSync(path.join(finalDir, dir), { recursive: true });
    }
  }

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
    fs.writeFileSync(
      path.join(finalDir, 'package.json'),
      JSON.stringify(pkgJson, null, 2),
      'utf8',
    );

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

## Base URL Configuration

Set runtime base URL using environment variable:

\`\`\`bash
BASE_URL=http://localhost:4000
\`\`\`

## Project Structure

\`\`\`
.
├── src/
│   ├── pages/      # Page Object Models
│   ├── tests/      # Playwright spec files
│   ├── locators/   # Resolved locator snapshots
│   ├── test-data/  # Externalized test data
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
}
