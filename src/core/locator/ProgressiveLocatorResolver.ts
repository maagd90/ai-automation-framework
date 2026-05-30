import type { Page } from 'playwright';
import type { TestStep } from '../domain/TestStep.js';
import type { LocatorResult } from '../domain/LocatorResult.js';
import type { LocatorCandidate } from '../domain/LocatorCandidate.js';
import { DomInspector } from '../browser/DomInspector.js';
import { Logger } from '../../utils/Logger.js';
import { LocatorService } from './LocatorService.js';
import { StepClassifier } from './StepClassifier.js';
import type { ElementNode } from '../domain/ElementNode.js';

export class ProgressiveLocatorResolver {
  private readonly logger = new Logger('ProgressiveLocatorResolver');
  private readonly locatorService: LocatorService;
  private readonly stepClassifier: StepClassifier;
  private readonly inspectorFactory: (page: Page) => { collectElements(): Promise<ElementNode[]> };

  constructor(options?: {
    locatorService?: LocatorService;
    stepClassifier?: StepClassifier;
    inspectorFactory?: (page: Page) => { collectElements(): Promise<ElementNode[]> };
  }) {
    this.locatorService = options?.locatorService ?? new LocatorService();
    this.stepClassifier = options?.stepClassifier ?? new StepClassifier();
    this.inspectorFactory = options?.inspectorFactory ?? ((page) => new DomInspector(page));
  }

  async resolve(page: Page, initialUrl: string, steps: TestStep[]): Promise<LocatorResult[]> {
    const results: LocatorResult[] = [];

    for (const step of steps) {
      const classification = this.stepClassifier.classify(step);

      if (classification.intent === 'navigation') {
        await this.executeNavigation(page, initialUrl, step);
        continue;
      }

      if (!classification.requiresLocator) {
        continue;
      }

      const elements = await this.inspectorFactory(page).collectElements();
      const locator = await this.locatorService.resolveLocatorForStep(page, step, elements);
      if (!locator) continue;

      results.push(locator);

      if (classification.shouldExecuteForProgression) {
        await this.executeAction(page, locator.primaryLocator, step);
        await page.waitForLoadState('networkidle', { timeout: 2_000 }).catch(() => undefined);
      }
    }

    this.logger.info(`Resolved ${results.length} locators with progressive inspection`);
    return results;
  }

  private async executeNavigation(page: Page, initialUrl: string, step: TestStep): Promise<void> {
    const target = step.value || step.target || initialUrl;
    const destination = /^https?:\/\//i.test(target) ? target : initialUrl;
    await page.goto(destination);
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
  }

  private async executeAction(page: Page, candidate: LocatorCandidate, step: TestStep): Promise<void> {
    const locator = this.locatorService.resolvePlaywrightLocator(page, candidate);

    switch (step.action) {
      case 'enter':
        await locator.fill(step.value ?? '');
        break;
      case 'select':
        await locator.selectOption(step.value ?? '');
        break;
      case 'check':
        await locator.check();
        break;
      case 'uncheck':
        await locator.uncheck();
        break;
      case 'click':
      default:
        await locator.click();
        break;
    }
  }
}
