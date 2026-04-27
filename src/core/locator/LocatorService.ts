import type { Page } from 'playwright';
import type { TestStep } from '../domain/TestStep.js';
import type { ElementNode } from '../domain/ElementNode.js';
import type { LocatorResult } from '../domain/LocatorResult.js';
import { LocatorCandidateBuilder } from './LocatorCandidateBuilder.js';
import { LocatorRanker } from './LocatorRanker.js';
import { LocatorValidator } from './LocatorValidator.js';
import { TargetMatcher } from './TargetMatcher.js';
import { Logger } from '../../utils/Logger.js';

export class LocatorService {
  private readonly builder = new LocatorCandidateBuilder();
  private readonly ranker = new LocatorRanker();
  private readonly validator = new LocatorValidator();
  private readonly matcher = new TargetMatcher();
  private readonly logger = new Logger('LocatorService');

  async resolveLocatorsForSteps(
    page: Page,
    steps: TestStep[],
    elements: ElementNode[],
  ): Promise<LocatorResult[]> {
    const results: LocatorResult[] = [];

    for (const step of steps) {
      const matched = this.matcher.match(step.target, elements, step.action);
      if (!matched) {
        this.logger.warn(`No element matched for target: ${step.target}`);
        continue;
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

      if (!primary) continue;

      const confidenceScore = parseFloat((primary.score / 100).toFixed(2));
      const confidenceReason = this.buildConfidenceReason(primary.strategy);

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
        confidenceScore,
        confidenceReason,
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
      const confidenceScore = parseFloat((primary.score / 100).toFixed(2));
      const confidenceReason = this.buildConfidenceReason(primary.strategy);
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
        confidenceScore,
        confidenceReason,
      });
    }
    return results;
  }

  private buildConfidenceReason(strategy: string): string {
    switch (strategy) {
      case 'getByTestId': return 'data-testid attribute matched — highly stable';
      case 'getByRole': return 'Accessible role and name matched';
      case 'getByLabel': return 'Associated label matched';
      case 'getByPlaceholder': return 'Placeholder text matched';
      case 'cssId': return 'Unique ID attribute matched';
      case 'cssName': return 'Name attribute matched';
      case 'getByText': return 'Visible text matched — may be fragile if text changes';
      case 'css': return 'CSS selector matched — may be positional';
      case 'xpath': return 'XPath matched — consider using a more stable locator';
      default: return 'Locator matched via fallback strategy';
    }
  }
}
