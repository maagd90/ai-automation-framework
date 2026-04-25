import type { TestCase } from '../domain/TestCase.js';
import type { GeneratedTestArtifact } from '../domain/GeneratedTestArtifact.js';
import type { LocatorResult } from '../domain/LocatorResult.js';
import type { AiSupportService } from '../ai/AiSupportService.js';
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
    aiSupport?: AiSupportService,
  ): Promise<GeneratedTestArtifact> {
    const actionableLocators = await this.applyMethodNames(
      locators.filter((locator) => !this.isPreconditionStep(locator.stepTarget)),
      aiSupport,
    );
    const pageName = this.resolvePageName(url, testCase.name);
    this.logger.info(`Generating code artifacts for: ${testCase.name}`);

    const pageObjectPath = this.pageObjectGen.generate(pageName, url, actionableLocators, outputDir);
    const specPath = this.specGen.generate(testCase, pageName, url, actionableLocators, outputDir);
    const locatorPath = `${outputDir}/src/locators/${StringUtils.toKebabCase(pageName)}.locators.json`;

    this.store.save(locatorPath, {
      schemaVersion: '1.0.0',
      page: StringUtils.toPascalCase(pageName),
      url,
      generatedAt: new Date().toISOString(),
      steps: actionableLocators.map((locator, index) => ({
        stepOrder: index + 1,
        stepTarget: locator.stepTarget,
        action: locator.action,
        primary: locator.primaryLocator,
        fallback: locator.fallbackLocators,
      })),
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

  private async applyMethodNames(
    locators: LocatorResult[],
    aiSupport?: AiSupportService,
  ): Promise<LocatorResult[]> {
    if (!aiSupport?.canUseNaming()) {
      return locators;
    }

    const nextLocators: LocatorResult[] = [];
    for (const locator of locators) {
      const deterministic = StringUtils.toMethodName(locator.action, locator.stepTarget);
      let methodName = deterministic;
      if (StringUtils.isPoorMethodName(deterministic)) {
        methodName = (await aiSupport.suggestMethodName(locator.action, locator.stepTarget)) ?? deterministic;
      }
      nextLocators.push({ ...locator, methodName });
    }
    return nextLocators;
  }

  private resolvePageName(url: string, fallbackName: string): string {
    try {
      const parsed = new URL(url);
      const segments = parsed.pathname
        .split('/')
        .map((s) => s.trim())
        .filter(Boolean);

      const candidate = segments[segments.length - 1] ?? 'home';
      return StringUtils.toKebabCase(candidate || 'home');
    } catch {
      return StringUtils.toKebabCase(fallbackName.replace(/\s+/g, '-')) || 'home';
    }
  }

  private isPreconditionStep(stepText: string): boolean {
    const normalized = StringUtils.normalize(stepText);
    return (
      normalized.startsWith('user is on')
      || normalized.startsWith('user is on the')
      || normalized.startsWith('navigate to')
      || normalized.includes(' navigate to ')
      || normalized.startsWith('open ')
      || normalized.includes(' open ')
      || (normalized.includes('page') && normalized.includes('is on'))
    );
  }
}
