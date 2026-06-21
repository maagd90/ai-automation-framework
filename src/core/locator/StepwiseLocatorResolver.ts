import type { Page } from 'playwright';
import type { TestStep } from '../domain/TestStep.js';
import type { ElementNode } from '../domain/ElementNode.js';
import type { LocatorResult } from '../domain/LocatorResult.js';
import { PageNavigator } from '../browser/PageNavigator.js';
import { DomInspector } from '../browser/DomInspector.js';
import { LocatorService } from '../locator/LocatorService.js';
import type { AiAssistService } from '../ai/AiAssistService.js';
import { Logger } from '../../utils/Logger.js';

/**
 * Resolves locators step-by-step, re-inspecting the DOM after each navigation.
 */
export class StepwiseLocatorResolver {
  private readonly navigator: PageNavigator;
  private readonly inspector: DomInspector;
  private readonly locatorService: LocatorService;
  private readonly logger = new Logger('StepwiseLocatorResolver');

  constructor(private readonly page: Page, aiAssist?: AiAssistService) {
    this.navigator = new PageNavigator(page);
    this.inspector = new DomInspector(page);
    this.locatorService = new LocatorService(aiAssist);
  }

  async resolve(steps: TestStep[], entryUrl: string): Promise<LocatorResult[]> {
    const sortedSteps = steps.slice().sort((a, b) => a.order - b.order);
    const results: LocatorResult[] = [];
    let elements: ElementNode[] = [];

    const firstStep = sortedSteps[0];
    if (firstStep?.action !== 'navigate') {
      await this.navigator.navigate(entryUrl);
      elements = await this.inspector.collectElements();
    }

    for (const step of sortedSteps) {
      if (step.action === 'navigate') {
        await this.navigator.navigate(step.target);
        elements = await this.inspector.collectElements();
        this.logger.info(`Re-collected ${elements.length} elements after navigate to ${step.target}`);
        const navigateLocator = await this.locatorService.resolveLocatorsForSteps(this.page, [step], elements);
        results.push(...navigateLocator);
        continue;
      }

      const stepLocators = await this.locatorService.resolveLocatorsForSteps(this.page, [step], elements);
      results.push(...stepLocators);
    }

    return results;
  }
}
