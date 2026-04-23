import { CandidateRanker } from '../CandidateRanker';
import { LocatorCandidate } from '../../domain';

const ranker = new CandidateRanker();

describe('CandidateRanker', () => {
  it('sorts candidates descending by score', () => {
    const candidates: LocatorCandidate[] = [
      { strategy: 'xpath', value: '//button', score: 0 },
      { strategy: 'css-testid', value: '[data-testid="btn"]', score: 0 },
      { strategy: 'text', value: "getByText('Login')", score: 0 },
    ];
    const ranked = ranker.rank(candidates);
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
    expect(ranked[1].score).toBeGreaterThanOrEqual(ranked[2].score);
  });

  it('data-testid strategy scores higher than xpath', () => {
    const candidates: LocatorCandidate[] = [
      { strategy: 'xpath', value: '//button', score: 0 },
      { strategy: 'css-testid', value: '[data-testid="login-btn"]', score: 0 },
    ];
    const ranked = ranker.rank(candidates);
    expect(ranked[0].strategy).toBe('css-testid');
  });

  it('uuid-like ids are penalized', () => {
    const withUuid: LocatorCandidate[] = [
      { strategy: 'css-id', value: '#a1b2c3d4-e5f6-7890-abcd-ef1234567890', score: 0 },
    ];
    const withStable: LocatorCandidate[] = [
      { strategy: 'css-id', value: '#submit-btn', score: 0 },
    ];
    const rankedUuid = ranker.rank(withUuid);
    const rankedStable = ranker.rank(withStable);
    expect(rankedStable[0].score).toBeGreaterThan(rankedUuid[0].score);
  });

  it('higher-priority strategies get higher base scores', () => {
    const candidates: LocatorCandidate[] = [
      { strategy: 'role', value: "getByRole('button', { name: 'Submit' })", score: 0 },
      { strategy: 'css-structural', value: 'button:nth-of-type(1)', score: 0 },
    ];
    const ranked = ranker.rank(candidates);
    expect(ranked[0].strategy).toBe('role');
  });
});
