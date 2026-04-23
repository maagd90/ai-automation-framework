import { HealingDecision, PageSnapshot, LocatorCandidate } from '../domain';
import { HealingError, createLogger } from '@ai-locator/shared';
import { CandidateBuilder } from '../services/CandidateBuilder';
import { CandidateRanker } from '../services/CandidateRanker';

const AUTO_HEAL_THRESHOLD = 95;
const SOFT_HEAL_THRESHOLD = 85;

export class HealingEngine {
  private readonly logger = createLogger('HealingEngine');
  private readonly builder = new CandidateBuilder();
  private readonly ranker = new CandidateRanker();

  async heal(
    elementId: string,
    snapshot: PageSnapshot,
    _page: unknown
  ): Promise<HealingDecision> {
    const element = snapshot.elements.find((e) => e.elementId === elementId);
    if (!element) {
      throw new HealingError(elementId, new Error('Element not found in snapshot'));
    }

    const oldLocator: LocatorCandidate = element.primaryLocator;

    const mockElement = {
      elementId: element.elementId,
      tag: element.tag,
      role: element.role,
      text: element.text,
      attributes: element.fingerprint.attributes,
      locators: [],
      framePath: element.framePath,
    };

    const candidates = this.builder.build(mockElement);
    const ranked = this.ranker.rank(candidates);
    const best = ranked[0];

    if (!best) {
      throw new HealingError(elementId, new Error('No candidates found'));
    }

    const confidence = Math.min(best.score, 100);
    const approved = confidence >= AUTO_HEAL_THRESHOLD;

    if (confidence < SOFT_HEAL_THRESHOLD) {
      this.logger.warn('Low confidence healing', { elementId, confidence });
    }

    return {
      elementId,
      oldLocator,
      newLocator: best,
      confidence,
      approved,
    };
  }
}
