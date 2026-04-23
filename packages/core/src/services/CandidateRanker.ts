import { LocatorCandidate } from '../domain';

const STRATEGY_BASE_SCORES: Record<string, number> = {
  'css-testid': 90,
  'role': 80,
  'label': 75,
  'css-id': 70,
  'css-name': 65,
  'css-semantic': 60,
  'text': 50,
  'xpath': 40,
  'css-structural': 20,
};

export class CandidateRanker {
  rank(candidates: LocatorCandidate[]): LocatorCandidate[] {
    const scored = candidates.map(c => ({ ...c, score: this.score(c) }));
    return scored.sort((a, b) => b.score - a.score);
  }

  private score(candidate: LocatorCandidate): number {
    let score = STRATEGY_BASE_SCORES[candidate.strategy] ?? 30;

    if (candidate.unique) score += 25;
    if (this.isDynamic(candidate.value)) score -= 20;
    if (candidate.value.length < 50) score += 10;
    if (['css-testid', 'role', 'label'].includes(candidate.strategy)) score += 15;
    if (!candidate.value.startsWith('//')) score += 10;
    if (candidate.strategy !== 'css-structural') score += 10;
    if (!this.isDynamic(candidate.value)) score += 10;

    return Math.max(0, Math.min(100, score));
  }

  private isDynamic(value: string): boolean {
    const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const numericRe = /\d{5,}/;
    const hashRe = /[a-z0-9]{12,}/i;
    return uuidRe.test(value) || numericRe.test(value) || hashRe.test(value);
  }
}
