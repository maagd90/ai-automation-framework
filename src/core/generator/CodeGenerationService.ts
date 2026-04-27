import type { TestCase } from '../domain/TestCase.js';
import type { GeneratedTestArtifact } from '../domain/GeneratedTestArtifact.js';
import type { LocatorResult } from '../domain/LocatorResult.js';
import { PageObjectGenerator } from './PageObjectGenerator.js';
import { SpecGenerator } from './SpecGenerator.js';
import { JsonArtifactStore } from '../storage/JsonArtifactStore.js';
import { StringUtils } from '../../utils/StringUtils.js';
import { Logger } from '../../utils/Logger.js';

const PAGE_KEYWORDS = [
  'login', 'signup', 'register', 'checkout', 'cart', 'basket',
  'dashboard', 'home', 'products', 'product', 'search', 'profile',
  'account', 'payment', 'confirmation', 'settings', 'admin',
];

export class CodeGenerationService {
  private readonly pageObjectGen = new PageObjectGenerator();
  private readonly specGen = new SpecGenerator();
  private readonly store = new JsonArtifactStore();
  private readonly logger = new Logger('CodeGenerationService');

  async generate(
    testCase: TestCase,
    url: string,
    locators: LocatorResult[],
    outputDir: string,
  ): Promise<GeneratedTestArtifact> {
    const pageName = this.inferPageName(testCase.name, url);
    this.logger.info(`Generating code artifacts for: ${testCase.name}`);

    const pageObjectPath = this.pageObjectGen.generate(pageName, url, locators, outputDir);
    const specPath = this.specGen.generate(testCase, pageName, url, locators, outputDir);
    const locatorPath = `${outputDir}/locators/${StringUtils.toKebabCase(pageName)}.locators.json`;

    this.store.save(locatorPath, {
      schemaVersion: '1.0.0',
      url,
      generatedAt: new Date().toISOString(),
      elements: locators,
    });

    const artifact: GeneratedTestArtifact = {
      pageName,
      pageObjectPath,
      specPath,
      locatorArtifactPath: locatorPath,
      generatedAt: new Date().toISOString(),
    };

    return artifact;
  }

  /**
   * Infer a clean page name from the test case name and URL path.
   *
   * Priority:
   * 1. Known page keyword found in the URL path.
   * 2. Known page keyword found in the test case name.
   * 3. URL path segment (cleaned).
   * 4. Test case name (kebab-case).
   */
  private inferPageName(testCaseName: string, url: string): string {
    let urlPath = '';
    try {
      urlPath = new URL(url).pathname;
    } catch {
      // ignore invalid URLs
    }

    // 1. URL path keyword match
    for (const kw of PAGE_KEYWORDS) {
      if (urlPath.toLowerCase().includes(kw)) {
        return kw;
      }
    }

    // 2. Test case name keyword match
    const nameLower = testCaseName.toLowerCase();
    for (const kw of PAGE_KEYWORDS) {
      if (nameLower.includes(kw)) {
        return kw;
      }
    }

    // 3. Last meaningful URL path segment
    const segments = urlPath.split('/').filter(Boolean);
    if (segments.length > 0) {
      const seg = segments[segments.length - 1]
        .replace(/[^a-zA-Z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      if (seg) return seg;
    }

    // 4. Cleaned test case name
    return StringUtils.toKebabCase(testCaseName.replace(/\s+/g, '-'));
  }
}
