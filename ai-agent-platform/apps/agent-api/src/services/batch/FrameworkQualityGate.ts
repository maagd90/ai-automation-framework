import fs from 'fs';
import path from 'path';
import { GeneratedDataReferenceValidator } from './GeneratedDataReferenceValidator';

export interface QualityGateIssue {
  code: string;
  message: string;
}

export class FrameworkQualityGate {
  private readonly dataValidator = new GeneratedDataReferenceValidator();

  validate(finalDir: string, runTscValidation: (dir: string) => void): void {
    const issues: QualityGateIssue[] = [];
    const testsDir = path.join(finalDir, 'src', 'tests');
    const pagesDir = path.join(finalDir, 'src', 'pages');
    const locatorsDir = path.join(finalDir, 'src', 'locators');

    for (const required of [path.join(finalDir, 'package.json'), path.join(finalDir, 'playwright.config.ts'), testsDir]) {
      if (!fs.existsSync(required)) {
        issues.push({ code: 'missing-required-file', message: `Missing required file: ${required}` });
      }
    }

    if (fs.existsSync(testsDir)) {
      const seenTitles = new Set<string>();
      for (const file of fs.readdirSync(testsDir).filter((entry) => entry.endsWith('.spec.ts'))) {
        const specPath = path.join(testsDir, file);
        const source = fs.readFileSync(specPath, 'utf8');
        for (const pageImport of source.matchAll(/from\s+['"]\.\.\/pages\/([^'"]+)['"]/g)) {
          if (!fs.existsSync(path.join(pagesDir, `${pageImport[1]}.ts`))) {
            issues.push({ code: 'missing-page-import', message: `${file} imports missing page ${pageImport[1]}.ts` });
          }
        }

        for (const titleMatch of source.matchAll(/^test\((["'`])([\s\S]*?)\1,/gm)) {
          const title = titleMatch[2];
          if (seenTitles.has(title)) {
            issues.push({ code: 'duplicate-test-title', message: `Duplicate test title detected: ${title}` });
          }
          seenTitles.add(title);
        }

        const dataImport = source.match(/import (\w+) from ['"]\.\.\/test-data\/([^'"]+)['"]/);
        if (dataImport) {
          const dataPath = path.join(finalDir, 'src', 'test-data', dataImport[2]);
          const data = fs.existsSync(dataPath)
            ? JSON.parse(fs.readFileSync(dataPath, 'utf8')) as Record<string, unknown>
            : {};
          const referenceIssues = this.dataValidator.validate(source, dataImport[1], data, specPath, dataPath);
          for (const issue of referenceIssues) {
            issues.push({
              code: 'missing-data-reference',
              message: `Generated data validation failed:\n${issue.specPath} references ${issue.reference}\nbut ${issue.dataPath} does not contain ${issue.reference.replace(/^\w+\./, '')}`,
            });
          }
        }
      }
    }

    if (fs.existsSync(pagesDir)) {
      for (const file of fs.readdirSync(pagesDir).filter((entry) => entry.endsWith('.ts'))) {
        const source = fs.readFileSync(path.join(pagesDir, file), 'utf8');
        const seenMethods = new Set<string>();
        for (const methodMatch of source.matchAll(/^  async (\w+)\(/gm)) {
          const name = methodMatch[1];
          if (seenMethods.has(name)) {
            issues.push({ code: 'duplicate-page-method', message: `${file} contains duplicate method ${name}` });
          }
          seenMethods.add(name);
        }
      }
    }

    if (fs.existsSync(locatorsDir)) {
      for (const file of fs.readdirSync(locatorsDir).filter((entry) => entry.endsWith('.json'))) {
        try {
          const parsed = JSON.parse(fs.readFileSync(path.join(locatorsDir, file), 'utf8')) as { feature?: string; locators?: Array<{ selector?: string; strategy?: string }> };
          if (!parsed.feature || !Array.isArray(parsed.locators)) {
            issues.push({ code: 'invalid-locator-schema', message: `${file} does not match the locator schema` });
            continue;
          }
          if (parsed.locators.some((locator) => !locator.selector || !locator.strategy)) {
            issues.push({ code: 'invalid-locator-schema', message: `${file} contains incomplete locator entries` });
          }
        } catch {
          issues.push({ code: 'invalid-locator-json', message: `${file} is not valid JSON` });
        }
      }
    }

    const packageJsonPath = path.join(finalDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { devDependencies?: Record<string, string> };
      for (const dep of ['@playwright/test', 'allure-playwright', 'allure-commandline', 'typescript']) {
        if (!pkg.devDependencies?.[dep]) {
          issues.push({ code: 'missing-package-dependency', message: `Generated package.json is missing ${dep}` });
        }
      }
    }

    const playwrightConfigPath = path.join(finalDir, 'playwright.config.ts');
    if (fs.existsSync(playwrightConfigPath)) {
      const config = fs.readFileSync(playwrightConfigPath, 'utf8');
      if (!config.includes("['allure-playwright']")) {
        issues.push({ code: 'missing-allure-reporter', message: 'Generated playwright.config.ts is missing allure-playwright reporter' });
      }
    }

    if (issues.length > 0) {
      throw new Error(issues.map((issue) => issue.message).join('\n'));
    }

    runTscValidation(finalDir);
  }
}
