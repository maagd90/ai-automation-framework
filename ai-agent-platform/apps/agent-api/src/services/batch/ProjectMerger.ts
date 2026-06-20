import fs from 'fs';
import path from 'path';
import { JOBS_BASE_DIR } from '../../config';
import type { JobEntity } from '../../domain/Job';

type RenameMap = Map<string, string>;

export class ProjectMerger {
  merge(job: JobEntity, childIds: string[]): string {
    const finalDir = path.join(JOBS_BASE_DIR, job.jobId, 'final-project');
    fs.rmSync(finalDir, { recursive: true, force: true });
    fs.mkdirSync(finalDir, { recursive: true });

    this.ensureProjectDirs(finalDir);

    for (const childId of childIds) {
      const srcDir = path.join(JOBS_BASE_DIR, job.jobId, 'children', childId, 'generated');
      if (!fs.existsSync(srcDir)) continue;

      const pageRenames = this.copyTypedFiles(
        path.join(srcDir, 'pages'),
        path.join(finalDir, 'pages'),
        childId,
      );
      this.copyTests(path.join(srcDir, 'tests'), path.join(finalDir, 'tests'), childId, pageRenames);
      this.copyTypedFiles(path.join(srcDir, 'locators'), path.join(finalDir, 'locators'), childId);
    }

    this.scaffoldProject(finalDir, job);

    return finalDir;
  }

  validate(finalDir: string): void {
    const requiredPaths = [
      path.join(finalDir, 'package.json'),
      path.join(finalDir, 'playwright.config.ts'),
      path.join(finalDir, 'tests'),
    ];

    for (const requiredPath of requiredPaths) {
      if (!fs.existsSync(requiredPath)) {
        throw new Error(`Merged project validation failed: missing ${path.basename(requiredPath)}`);
      }
    }

    const testDir = path.join(finalDir, 'tests');
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
        const pageTs = path.join(finalDir, 'pages', `${importTarget}.ts`);
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
    for (const dir of ['pages', 'tests', 'locators', 'test-data', 'reports']) {
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
        '@playwright/test': '^1.41.0',
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
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: ${job.retryCount},
  workers: 1,
  reporter: [['html', { open: 'never' }], ['line'], ['json', { outputFile: 'reports/playwright-report.json' }]],
  use: {
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
        skipLibCheck: true,
      },
    };
    fs.writeFileSync(
      path.join(finalDir, 'tsconfig.json'),
      JSON.stringify(tsConfig, null, 2),
      'utf8',
    );

    const readme = `# Generated Playwright Project

Auto-generated by the AI QA Automation Platform.

## Setup

\`\`\`bash
npm install
npx playwright install
\`\`\`

## Run Tests

\`\`\`bash
npm test
\`\`\`

## View Report

\`\`\`bash
npm run show-report
\`\`\`

## Project Structure

\`\`\`
.
├── pages/          # Page Object Models
├── tests/          # Playwright spec files
├── locators/       # Resolved locator snapshots
├── reports/        # Execution reports
├── playwright.config.ts
└── package.json
\`\`\`
`;
    fs.writeFileSync(path.join(finalDir, 'README.md'), readme, 'utf8');
  }
}
