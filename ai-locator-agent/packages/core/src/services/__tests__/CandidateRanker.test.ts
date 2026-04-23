import { CandidateRanker } from '../CandidateRanker';
import { LocatorCandidate } from '../../domain';

describe('CandidateRanker', () => {
  let ranker: CandidateRanker;

  beforeEach(() => {
    ranker = new CandidateRanker();
  });

  it('ranks data-testid first', () => {
    const candidates: LocatorCandidate[] = [
      { strategy: 'css', value: 'button.submit', score: 50 },
      { strategy: 'data-testid', value: '[data-testid="submit"]', score: 100 },
      { strategy: 'text', value: 'Submit', score: 60 },
    ];
    const ranked = ranker.rank(candidates);
    expect(ranked[0].strategy).toBe('data-testid');
  });

  it('penalizes dynamic values', () => {
    const candidates: LocatorCandidate[] = [
      { strategy: 'css', value: '#abc123def456', score: 80 },
      { strategy: 'css', value: '#stable-id', score: 70 },
    ];
    const ranked = ranker.rank(candidates);
    expect(ranked[0].value).toBe('#stable-id');
  });

  it('returns all candidates', () => {
    const candidates: LocatorCandidate[] = [
      { strategy: 'css', value: 'button', score: 10 },
      { strategy: 'text', value: 'Click', score: 60 },
    ];
    const ranked = ranker.rank(candidates);
    expect(ranked).toHaveLength(2);
  });
});
