import { LocatorCandidate } from '../domain';
import { isDynamicValue } from '@ai-locator/shared';

interface ScoredCandidate extends LocatorCandidate {
  compositeScore: number;
}

export class CandidateRanker {
  rank(candidates: LocatorCandidate[]): LocatorCandidate[] {
    const scored: ScoredCandidate[] = candidates.map((c) => ({
      ...c,
      compositeScore: this.computeScore(c),
    }));

    scored.sort((a, b) => b.compositeScore - a.compositeScore);

    return scored.map(({ compositeScore: _compositeScore, ...c }) => c);
  }

  private computeScore(candidate: LocatorCandidate): number {
    let score = candidate.score;

    score += this.uniquenessScore(candidate);
    score += this.stabilityScore(candidate);
    score += this.readabilityScore(candidate);
    score += this.semanticScore(candidate);
    score += this.portabilityScore(candidate);
    score -= this.dynamicPenalty(candidate);

    return score;
  }

  private uniquenessScore(candidate: LocatorCandidate): number {
    if (candidate.strategy === 'data-testid') return 25;
    if (candidate.strategy === 'role') return 20;
    if (candidate.strategy === 'label') return 18;
    if (candidate.strategy === 'css' && candidate.value.startsWith('#')) return 15;
    return 5;
  }

  private stabilityScore(candidate: LocatorCandidate): number {
    if (candidate.strategy === 'data-testid') return 20;
    if (candidate.strategy === 'label') return 15;
    if (candidate.strategy === 'role') return 12;
    if (candidate.strategy === 'css' && !candidate.value.includes(':nth-')) return 10;
    if (candidate.strategy === 'xpath') return 5;
    return 3;
  }

  private readabilityScore(candidate: LocatorCandidate): number {
    const len = candidate.value.length;
    if (len < 30) return 10;
    if (len < 60) return 7;
    if (len < 100) return 4;
    return 1;
  }

  private semanticScore(candidate: LocatorCandidate): number {
    if (candidate.strategy === 'role') return 15;
    if (candidate.strategy === 'label') return 12;
    if (candidate.strategy === 'data-testid') return 10;
    if (candidate.strategy === 'text') return 8;
    return 3;
  }

  private portabilityScore(candidate: LocatorCandidate): number {
    if (candidate.strategy === 'data-testid') return 10;
    if (candidate.strategy === 'css') return 8;
    if (candidate.strategy === 'xpath') return 5;
    return 7;
  }

  private dynamicPenalty(candidate: LocatorCandidate): number {
    // Extract the meaningful part from selectors (e.g. strip leading # from CSS ID selectors)
    const rawValue = candidate.value.startsWith('#') ? candidate.value.slice(1) : candidate.value;
    if (isDynamicValue(rawValue)) return 50;
    if (/:nth-child|:nth-of-type|\[\d+\]/.test(candidate.value)) return 20;
    return 0;
  }
}
