import path from 'path';
import type { TestCase } from '../domain/TestCase.js';
import type { LocatorResult } from '../domain/LocatorResult.js';
import { StringUtils } from '../../utils/StringUtils.js';
import { FileUtils } from '../../utils/FileUtils.js';
import { Logger } from '../../utils/Logger.js';

export class SpecGenerator {
  private readonly logger = new Logger('SpecGenerator');

  generate(
    testCase: TestCase,
    pageName: string,
    url: string,
    locators: LocatorResult[],
    outputDir: string,
  ): string {
    const className = StringUtils.toPascalCase(pageName) + 'Page';
    const specName = StringUtils.toKebabCase(pageName);
    const outPath = path.join(outputDir, 'tests', `${specName}.spec.ts`);
    const pageVarName = StringUtils.toCamelCase(pageName) + 'Page';

    const callLines: string[] = [];
    callLines.push(`await page.goto('${url}');`);

    for (const locator of locators) {
      const methodName = StringUtils.toMethodName(locator.action, locator.stepTarget);
      const step = testCase.steps.find(s => s.target === locator.stepTarget);
      switch (locator.action) {
        case 'enter':
          callLines.push(`await ${pageVarName}.${methodName}('${step?.value ?? ''}');`);
          break;
        case 'verifyText':
          callLines.push(`await ${pageVarName}.${methodName}('${step?.value ?? ''}');`);
          break;
        default:
          callLines.push(`await ${pageVarName}.${methodName}();`);
      }
    }

    const content = `import { test } from '@playwright/test';
import { ${className} } from '../pages/${className}.js';

test('${testCase.name}', async ({ page }) => {
  const ${pageVarName} = new ${className}(page);

${callLines.map(l => `  ${l.trim()}`).join('\n')}
});
`;

    FileUtils.ensureDir(path.dirname(outPath));
    FileUtils.writeFile(outPath, content);
    this.logger.info(`Spec file generated: ${outPath}`);
    return outPath;
  }
}
