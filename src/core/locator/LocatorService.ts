import type { Page } from 'playwright';
import type { TestStep } from '../domain/TestStep.js';
import type { ElementNode } from '../domain/ElementNode.js';
import type { LocatorResult } from '../domain/LocatorResult.js';
import { LocatorCandidateBuilder } from './LocatorCandidateBuilder.js';
import { LocatorRanker } from './LocatorRanker.js';
import { LocatorValidator } from './LocatorValidator.js';
import { TargetMatcher } from './TargetMatcher.js';
import { LocatorResolutionError } from './LocatorResolutionError.js';
import { Logger } from '../../utils/Logger.js';
import type { AiAssistService } from '../ai/AiAssistService.js';

export class LocatorService {
  private readonly builder = new LocatorCandidateBuilder();
  private readonly ranker = new LocatorRanker();
  private readonly validator = new LocatorValidator();
  private readonly matcher = new TargetMatcher();
  private readonly logger = new Logger('LocatorService');

  constructor(private readonly aiAssist?: AiAssistService) {}

  async resolveLocatorsForSteps(
    page: Page,
    steps: TestStep[],
    elements: ElementNode[],
  ): Promise<LocatorResult[]> {
    const results: LocatorResult[] = [];

    for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
      const step = steps[stepIndex];
      if (step.action === 'navigate') {
        results.push({
          stepTarget: step.target,
          action: 'navigate',
          element: {
            tagName: 'navigate',
          },
          primaryLocator: {
            strategy: 'css',
            value: step.target,
            score: 100,
            validated: true,
            unique: true,
          },
          fallbackLocators: [],
        });
        continue;
      }

      let matched = this.matcher.match(step.target, elements, step.action);
      if (!matched && this.aiAssist) {
        const labels = elements
          .map((el) => el.accessibleName || el.associatedLabel || el.placeholder || el.text)
          .filter((label): label is string => Boolean(label));
        const aiChoice = await this.aiAssist.suggestTargetMapping(step.target, labels);
        if (aiChoice) {
          matched = this.matcher.match(aiChoice, elements, step.action);
        }
      }
      if (!matched) {
        throw new LocatorResolutionError(stepIndex, step.target, step.action);
      }

      this.logger.info(`Matched target "${step.target}"`, {
        confidence: matched.confidence,
        diagnostics: matched.diagnostics.join(', '),
      });

      const rawCandidates = this.builder.build(matched.element);
      const ranked = this.ranker.rank(rawCandidates);
      const validated = await Promise.all(ranked.map(c => this.validator.validate(page, c)));
      const unique = validated.filter(c => c.unique);
      const primary = unique[0] ?? validated[0];
      const fallbacks = (unique.length > 0 ? unique.slice(1) : validated.slice(1)).slice(0, 3);

      if (!primary) {
        throw new LocatorResolutionError(stepIndex, step.target, step.action, 'No valid locator candidate found');
      }

      results.push({
        stepTarget: step.target,
        action: step.action,
        element: {
          tagName: matched.element.tagName,
          name: matched.element.name,
          placeholder: matched.element.placeholder,
          associatedLabel: matched.element.associatedLabel,
          accessibleName: matched.element.accessibleName,
          id: matched.element.id,
          dataTestId: matched.element.dataTestId,
        },
        primaryLocator: primary,
        fallbackLocators: fallbacks,
      });
    }

    return results;
  }

  async scanPageLocators(page: Page, elements: ElementNode[]): Promise<LocatorResult[]> {
    const results: LocatorResult[] = [];
    for (const el of elements) {
      const rawCandidates = this.builder.build(el);
      if (rawCandidates.length === 0) continue;
      const ranked = this.ranker.rank(rawCandidates);
      const validated = await Promise.all(ranked.slice(0, 5).map(c => this.validator.validate(page, c)));
      const unique = validated.filter(c => c.unique);
      const primary = unique[0] ?? validated[0];
      if (!primary) continue;
      results.push({
        stepTarget: el.text || el.dataTestId || el.id || el.tagName,
        action: 'click',
        element: {
          tagName: el.tagName,
          name: el.name,
          id: el.id,
          dataTestId: el.dataTestId,
        },
        primaryLocator: primary,
        fallbackLocators: unique.slice(1).slice(0, 2),
      });
    }
    return results;
  }
}
