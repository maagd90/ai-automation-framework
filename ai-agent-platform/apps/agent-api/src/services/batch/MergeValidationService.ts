import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

export interface MergeValidationResult {
  valid: boolean;
  errors: string[];
}

export class MergeValidationService {
  validate(finalDir: string): MergeValidationResult {
    const errors: string[] = [];

    errors.push(...this.checkDuplicateClasses(finalDir));
    errors.push(...this.checkDuplicateMethods(finalDir));
    errors.push(...this.checkLocatorsInSpecs(finalDir));
    errors.push(...this.checkImports(finalDir));

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    const tsc = spawnSync('npx', ['tsc', '--noEmit', '-p', finalDir], {
      encoding: 'utf-8',
      timeout: 120_000,
    });
    if (tsc.status !== 0) {
      errors.push(`TypeScript compile failed: ${tsc.stderr || tsc.stdout}`);
      return { valid: false, errors };
    }

    return { valid: true, errors: [] };
  }

  dryRunPlaywright(finalDir: string): MergeValidationResult {
    const list = spawnSync('npx', ['playwright', 'test', '--list'], {
      cwd: finalDir,
      encoding: 'utf-8',
      timeout: 120_000,
      env: { ...process.env, CI: '1' },
    });
    if (list.status !== 0) {
      return {
        valid: false,
        errors: [`Playwright dry-run failed: ${list.stderr || list.stdout}`],
      };
    }
    return { valid: true, errors: [] };
  }

  private checkDuplicateClasses(finalDir: string): string[] {
    const pagesDir = path.join(finalDir, 'pages');
    if (!fs.existsSync(pagesDir)) return [];
    const seen = new Map<string, string>();
    const errors: string[] = [];
    for (const file of fs.readdirSync(pagesDir).filter((f) => f.endsWith('.ts'))) {
      const content = fs.readFileSync(path.join(pagesDir, file), 'utf8');
      const match = content.match(/export class (\w+)/);
      if (!match) continue;
      const className = match[1];
      if (seen.has(className)) {
        errors.push(`Duplicate page class "${className}" in ${file} and ${seen.get(className)}`);
      } else {
        seen.set(className, file);
      }
    }
    return errors;
  }

  private checkDuplicateMethods(finalDir: string): string[] {
    const pagesDir = path.join(finalDir, 'pages');
    if (!fs.existsSync(pagesDir)) return [];
    const errors: string[] = [];
    for (const file of fs.readdirSync(pagesDir).filter((f) => f.endsWith('.ts') && f !== 'BasePage.ts')) {
      const content = fs.readFileSync(path.join(pagesDir, file), 'utf8');
      const seen = new Set<string>();
      for (const match of content.matchAll(/async (\w+)\(/g)) {
        const name = match[1];
        if (seen.has(name)) {
          errors.push(`${file}: duplicate method "${name}"`);
        } else {
          seen.add(name);
        }
      }
    }
    return errors;
  }

  private checkLocatorsInSpecs(finalDir: string): string[] {
    const testsDir = path.join(finalDir, 'tests');
    if (!fs.existsSync(testsDir)) return [];
    const errors: string[] = [];
    for (const file of fs.readdirSync(testsDir).filter((f) => f.endsWith('.spec.ts'))) {
      const content = fs.readFileSync(path.join(testsDir, file), 'utf8');
      if (/page\.(getBy|locator)\(/.test(content)) {
        errors.push(`${file}: raw locators in spec — use page objects (DIP)`);
      }
    }
    return errors;
  }

  private checkImports(finalDir: string): string[] {
    const testsDir = path.join(finalDir, 'tests');
    if (!fs.existsSync(testsDir)) return ['Missing tests directory'];
    const errors: string[] = [];
    for (const specFile of fs.readdirSync(testsDir).filter((f) => f.endsWith('.spec.ts'))) {
      const content = fs.readFileSync(path.join(testsDir, specFile), 'utf8');
      for (const match of content.matchAll(/from\s+['"]\.\.\/pages\/([^'"]+)['"]/g)) {
        const importTarget = match[1];
        const pageTs = path.join(finalDir, 'pages', `${importTarget}.ts`);
        if (!fs.existsSync(pageTs)) {
          errors.push(`${specFile} imports missing page ${importTarget}.ts`);
        }
      }
    }
    return errors;
  }
}
