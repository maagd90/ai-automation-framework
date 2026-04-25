import type { TestCase } from '../domain/TestCase.js';
import type { GeneratedTestArtifact } from '../domain/GeneratedTestArtifact.js';
import type { LocatorResult } from '../domain/LocatorResult.js';
import { PageObjectGenerator } from './PageObjectGenerator.js';
import { SpecGenerator } from './SpecGenerator.js';
import { JsonArtifactStore } from '../storage/JsonArtifactStore.js';
import { StringUtils } from '../../utils/StringUtils.js';
import { Logger } from '../../utils/Logger.js';

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
    const pageName = StringUtils.toKebabCase(testCase.name.replace(/\s+/g, '-'));
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
}
