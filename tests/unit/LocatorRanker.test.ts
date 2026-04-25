import { describe, it, expect } from 'vitest';
import { LocatorRanker } from '../../src/core/locator/LocatorRanker.js';
import type { LocatorCandidate } from '../../src/core/domain/LocatorCandidate.js';

const makeCandidate = (strategy: string, value: string): LocatorCandidate => ({
  strategy,
  value,
  score: 0,
  validated: false,
  unique: false,
});

describe('LocatorRanker', () => {
  const ranker = new LocatorRanker();

  it('ranks getByTestId higher than xpath', () => {
    const candidates = [
      makeCandidate('xpath', "//button[text()='Login']"),
      makeCandidate('getByTestId', 'login-btn'),
    ];
    const ranked = ranker.rank(candidates);
    expect(ranked[0].strategy).toBe('getByTestId');
  });

  it('sorts candidates descending by score', () => {
    const candidates = [
      makeCandidate('css', '.btn.login'),
      makeCandidate('getByTestId', 'btn'),
      makeCandidate('getByRole', 'button, { name: "Login" }'),
    ];
    const ranked = ranker.rank(candidates);
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
    expect(ranked[1].score).toBeGreaterThanOrEqual(ranked[2].score);
  });

  it('penalizes nth-child selectors', () => {
    const c1 = makeCandidate('css', 'button:nth-child(1)');
    const c2 = makeCandidate('css', 'button.login');
    const ranked = ranker.rank([c1, c2]);
    expect(ranked[0].value).toBe('button.login');
  });

  it('penalizes numeric-only ids', () => {
    const c = makeCandidate('cssId', '#12345');
    const ranked = ranker.rank([c]);
    expect(ranked[0].score).toBeLessThan(80);
  });
});
