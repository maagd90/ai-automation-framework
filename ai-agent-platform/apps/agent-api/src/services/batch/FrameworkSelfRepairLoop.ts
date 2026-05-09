import fs from 'fs';
import path from 'path';

export class FrameworkSelfRepairLoop {
  run(finalDir: string, validate: () => void, maxAttempts = 3): void {
    let attempt = 0;
    let lastError: unknown;

    while (attempt < maxAttempts) {
      try {
        validate();
        return;
      } catch (error) {
        lastError = error;
        attempt += 1;
        const repaired = this.repair(finalDir, String(error));
        if (!repaired) break;
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private repair(finalDir: string, message: string): boolean {
    if (message.includes('duplicate method')) {
      return this.dedupePageMethods(path.join(finalDir, 'src', 'pages'));
    }

    if (message.includes('Duplicate test title')) {
      return this.dedupeSpecTitles(path.join(finalDir, 'src', 'tests'));
    }

    return false;
  }

  private dedupePageMethods(pagesDir: string): boolean {
    if (!fs.existsSync(pagesDir)) return false;
    let changed = false;

    for (const file of fs.readdirSync(pagesDir).filter((entry) => entry.endsWith('.ts'))) {
      const pagePath = path.join(pagesDir, file);
      const source = fs.readFileSync(pagePath, 'utf8');
      const seen = new Set<string>();
      const next = source.replace(/^  async (\w+)\([^)]*\): Promise<[^>]+> \{[\s\S]*?^  \}/gm, (block, name: string) => {
        if (seen.has(name)) {
          changed = true;
          return '';
        }
        seen.add(name);
        return block;
      });
      if (next !== source) {
        fs.writeFileSync(pagePath, next.replace(/\n{3,}/g, '\n\n'), 'utf8');
      }
    }

    return changed;
  }

  private dedupeSpecTitles(testsDir: string): boolean {
    if (!fs.existsSync(testsDir)) return false;
    let changed = false;

    for (const file of fs.readdirSync(testsDir).filter((entry) => entry.endsWith('.spec.ts'))) {
      const specPath = path.join(testsDir, file);
      const source = fs.readFileSync(specPath, 'utf8');
      const seen = new Set<string>();
      const next = source.replace(/^test\((["'`])([\s\S]*?)\1,[\s\S]*?^\}\);?/gm, (block, _quote: string, title: string) => {
        if (seen.has(title)) {
          changed = true;
          return '';
        }
        seen.add(title);
        return block;
      });
      if (next !== source) {
        fs.writeFileSync(specPath, next.replace(/\n{3,}/g, '\n\n'), 'utf8');
      }
    }

    return changed;
  }
}
