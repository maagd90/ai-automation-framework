import { LocatorCandidate, LocatorFingerprint, HealingDecision, ElementNode } from '../domain';
import { CandidateBuilder } from '../services/CandidateBuilder';
import { CandidateRanker } from '../services/CandidateRanker';
import { Logger } from '@locator-agent/shared';

export class HealingEngine {
  private readonly logger = new Logger('HealingEngine');
  private readonly builder = new CandidateBuilder();
  private readonly ranker = new CandidateRanker();

  heal(elementId: string, oldLocator: LocatorCandidate, fingerprint: LocatorFingerprint): HealingDecision {
    const elementNode: ElementNode = {
      tag: fingerprint.tag,
      role: fingerprint.role,
      text: fingerprint.accessibleName,
      ariaLabel: fingerprint.accessibleName,
      attributes: fingerprint.stableAttributes,
      framePath: fingerprint.framePath,
    };

    const candidates = this.builder.build(elementNode);
    const ranked = this.ranker.rank(candidates);
    const best = ranked[0];
    const confidence = best?.score ?? 0;

    this.logger.info('Healing decision', { elementId, confidence });

    if (confidence >= 95) {
      return {
        elementId,
        oldLocator,
        newLocator: best,
        confidence,
        approved: true,
        auditNote: 'auto-healed: confidence above threshold',
      };
    } else if (confidence >= 85) {
      return {
        elementId,
        oldLocator,
        newLocator: best,
        confidence,
        approved: false,
        auditNote: 'requires review',
      };
    } else {
      return {
        elementId,
        oldLocator,
        newLocator: best ?? oldLocator,
        confidence,
        approved: false,
        auditNote: 'below threshold — investigation required',
      };
    }
  }
}
