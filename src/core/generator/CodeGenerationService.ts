import type { TestCase } from '../domain/TestCase.js';
import type { GeneratedTestArtifact } from '../domain/GeneratedTestArtifact.js';
import type { LocatorResult } from '../domain/LocatorResult.js';
import { PageObjectGenerator } from './PageObjectGenerator.js';
import { SpecGenerator } from './SpecGenerator.js';
import { JsonArtifactStore } from '../storage/JsonArtifactStore.js';
import { StringUtils } from '../../utils/StringUtils.js';
import { screenToPageName, deriveUrlFromSteps } from '../../utils/ScreenUrlUtils.js';
import { Logger } from '../../utils/Logger.js';
import { FileUtils } from '../../utils/FileUtils.js';
import path from 'path';
import type { AiAssistService } from '../ai/AiAssistService.js';

export class CodeGenerationService {
  private readonly pageObjectGen = new PageObjectGenerator();
  private readonly specGen = new SpecGenerator();
  private readonly store = new JsonArtifactStore();
  private readonly logger = new Logger('CodeGenerationService');

  constructor(private readonly aiAssist?: AiAssistService) {}

  async generate(
    testCase: TestCase,
    url: string,
    locators: LocatorResult[],
    outputDir: string,
  ): Promise<GeneratedTestArtifact> {
    const pageName = this.resolvePageName(testCase, url, locators);
    this.logger.info(`Generating code artifacts for: ${testCase.name}`);

    this.ensureBasePage(outputDir);
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

  private resolvePageName(testCase: TestCase, url: string, locators: LocatorResult[]): string {
    const fromSteps = deriveUrlFromSteps(testCase.steps);
    const screenUrl = fromSteps ?? url;
    const base = screenToPageName(screenUrl);
    return base;
  }

  private ensureBasePage(outputDir: string): void {
    const basePagePath = path.join(outputDir, 'pages', 'BasePage.ts');
    if (FileUtils.exists(basePagePath)) return;
    const content = `import { type Page } from '@playwright/test';

export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  async goto(url: string): Promise<void> {
    await this.page.goto(url);
    await this.page.waitForLoadState('networkidle');
  }

  async waitForReady(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
  }
}
`;
    FileUtils.writeFile(basePagePath, content);
  }
}
