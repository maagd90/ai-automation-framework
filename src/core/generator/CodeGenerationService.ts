import type { TestCase } from '../domain/TestCase.js';
import type { GeneratedTestArtifact } from '../domain/GeneratedTestArtifact.js';
import type { LocatorResult } from '../domain/LocatorResult.js';
import type { AiSupportService } from '../ai/AiSupportService.js';
import { PageObjectGenerator } from './PageObjectGenerator.js';
import { SpecGenerator } from './SpecGenerator.js';
import { JsonArtifactStore } from '../storage/JsonArtifactStore.js';
import { StringUtils } from '../../utils/StringUtils.js';
import { Logger } from '../../utils/Logger.js';
import { FeatureNameResolver } from './FeatureNameResolver.js';

export class CodeGenerationService {
  private readonly pageObjectGen = new PageObjectGenerator();
  private readonly specGen = new SpecGenerator();
  private readonly store = new JsonArtifactStore();
  private readonly logger = new Logger('CodeGenerationService');
  private readonly featureNameResolver = new FeatureNameResolver();

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
    const pageName = this.featureNameResolver.resolve({ testCase, url });
    this.logger.info(`Generating code artifacts for: ${testCase.name}`);

    const pageObject = this.pageObjectGen.generate(pageName, url, actionableLocators, outputDir);
    const spec = this.specGen.generate(testCase, pageName, url, actionableLocators, outputDir);
    const locatorPath = `${outputDir}/src/locators/${StringUtils.toKebabCase(pageName)}.locators.json`;
    const normalizedArtifactPath = `${outputDir}/normalized-artifact.json`;

    this.store.save(locatorPath, {
      schemaVersion: '1.0.0',
      page: StringUtils.toPascalCase(pageName),
      url,
      generatedAt: new Date().toISOString(),
      steps: actionableLocators.map((locator) => ({
        stepOrder: locator.stepOrder,
        stepTarget: locator.stepTarget,
        action: locator.action,
        primary: locator.primaryLocator,
        fallback: locator.fallbackLocators,
      })),
    });

    this.store.save(normalizedArtifactPath, {
      schemaVersion: '1.0.0',
      feature: pageName,
      page: pageObject.model,
      specs: [
        {
          title: spec.model.title,
          dataReferences: spec.model.dataReferences,
          assertions: spec.model.assertionLines,
          body: spec.model.testBody,
        },
      ],
      testData: spec.model.testData,
      locators: actionableLocators.map((locator) => this.toNormalizedLocator(locator)),
    });

    const artifact: GeneratedTestArtifact = {
      pageName,
      pageObjectPath: pageObject.path,
      specPath: spec.path,
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

  private toNormalizedLocator(locator: LocatorResult) {
    const selector = this.toSelectorExpression(locator.primaryLocator);
    const name = StringUtils.toCamelCase(locator.stepTarget.replace(/\b(field|button|input|link)\b/gi, '').trim())
      || `step${locator.stepOrder}`;

    return {
      name,
      target: locator.stepTarget,
      selector,
      strategy: locator.primaryLocator.strategy,
      confidenceScore: Math.max(0, Math.min(1, locator.primaryLocator.score / 100)),
      fallbackLocators: locator.fallbackLocators.map((fallback) => ({
        name,
        target: locator.stepTarget,
        selector: this.toSelectorExpression(fallback),
        strategy: fallback.strategy,
        confidenceScore: Math.max(0, Math.min(1, fallback.score / 100)),
      })),
    };
  }

  private toSelectorExpression(candidate: LocatorResult['primaryLocator']): string {
    switch (candidate.strategy) {
      case 'getByTestId':
        return `page.getByTestId(${JSON.stringify(candidate.value)})`;
      case 'getByLabel':
        return `page.getByLabel(${JSON.stringify(candidate.value)})`;
      case 'getByPlaceholder':
        return `page.getByPlaceholder(${JSON.stringify(candidate.value)})`;
      case 'getByText':
        return `page.getByText(${JSON.stringify(candidate.value)})`;
      case 'getByRole':
        try {
          const parsed = JSON.parse(candidate.value) as { role?: string; name?: string };
          if (parsed.role && parsed.name) {
            return `page.getByRole(${JSON.stringify(parsed.role)}, { name: ${JSON.stringify(parsed.name)} })`;
          }
          if (parsed.role) {
            return `page.getByRole(${JSON.stringify(parsed.role)})`;
          }
        } catch {
          return `page.getByRole(${JSON.stringify(candidate.value)})`;
        }
        return `page.getByRole(${JSON.stringify(candidate.value)})`;
      default:
        return `page.locator(${JSON.stringify(candidate.value)})`;
    }
  }
}
