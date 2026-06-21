import fs from 'fs';
import path from 'path';
import type { TestCase } from '@ai-agent/shared-types';

export class SpecRewriteService {
  rewriteSpecs(
    children: Array<{ childId: string; testCase: TestCase; generatedDir: string }>,
    testsDir: string,
    classByChild: Map<string, string>,
  ): void {
    fs.mkdirSync(testsDir, { recursive: true });

    for (const child of children) {
      const srcTests = path.join(child.generatedDir, 'tests');
      if (!fs.existsSync(srcTests)) continue;

      const className = classByChild.get(child.childId);
      if (!className) continue;

      const specFiles = fs.readdirSync(srcTests).filter((f) => f.endsWith('.spec.ts'));
      const srcSpec = specFiles[0];
      if (!srcSpec) continue;

      const srcContent = fs.readFileSync(path.join(srcTests, srcSpec), 'utf8');
      const tc = child.testCase;
      const destName = `${tc.id.toLowerCase().replace(/[^a-z0-9-]/g, '-')}.spec.ts`;
      const varName = className.charAt(0).toLowerCase() + className.slice(1);

      const body = this.extractTestBody(srcContent, className, varName);
      const content = `import { test } from '@playwright/test';
import { ${className} } from '../pages/${className}';

test.describe(${JSON.stringify(`${tc.id}: ${tc.name}`)}, () => {
  test(${JSON.stringify(tc.name)}, async ({ page }) => {
    const ${varName} = new ${className}(page);
${body}
  });
});
`;
      fs.writeFileSync(path.join(testsDir, destName), content, 'utf8');
    }
  }

  private extractTestBody(srcContent: string, className: string, varName: string): string {
    const testMatch = srcContent.match(/test\([^,]+,\s*async\s*\(\{[^}]*\}\)\s*=>\s*\{([\s\S]*?)\n\s*\}\);/);
    if (!testMatch) {
      return `    await ${varName}.goto();`;
    }

    let body = testMatch[1];
    const oldClassMatch = srcContent.match(/import\s*\{\s*(\w+)\s*\}\s*from\s*['"]\.\.\/pages\//);
    if (oldClassMatch) {
      const oldClass = oldClassMatch[1];
      const oldVar = oldClass.charAt(0).toLowerCase() + oldClass.slice(1);
      body = body
        .replace(new RegExp(`const\\s+${oldVar}\\s*=\\s*new\\s+${oldClass}\\(page\\);?\\s*`, 'g'), '')
        .replace(new RegExp(`\\b${oldVar}\\.`, 'g'), `${varName}.`);
    }

    const lines = body
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('const '));

    if (lines.length === 0) {
      return `    await ${varName}.goto();`;
    }

    return lines.map((line) => `    ${line}`).join('\n');
  }
}
