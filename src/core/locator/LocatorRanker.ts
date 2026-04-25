import type { LocatorCandidate } from '../domain/LocatorCandidate.js';

const BASE_SCORES: Record<string, number> = {
  getByTestId: 95,
  getByRole: 90,
  getByLabel: 88,
  getByPlaceholder: 82,
  cssId: 80,
  cssName: 75,
  getByText: 70,
  css: 65,
  xpath: 55,
};

export class LocatorRanker {
  rank(candidates: LocatorCandidate[]): LocatorCandidate[] {
    const scored = candidates.map(c => ({
      ...c,
      score: this.computeScore(c),
    }));
    return scored.sort((a, b) => b.score - a.score);
  }

  private computeScore(candidate: LocatorCandidate): number {
    let score = BASE_SCORES[candidate.strategy] ?? 50;

    if (candidate.value.length > 80) score -= 10;
    else if (candidate.value.length > 40) score -= 5;

    if (candidate.value.includes('nth-child') || candidate.value.includes('nth-of-type')) {
      score -= 15;
    }

    if (/^\d+$/.test(candidate.value) || /^#\d+$/.test(candidate.value) || /[0-9a-f]{8}-[0-9a-f]{4}/.test(candidate.value)) {
      score -= 20;
    }

    return Math.max(0, Math.min(100, score));
  }
}
