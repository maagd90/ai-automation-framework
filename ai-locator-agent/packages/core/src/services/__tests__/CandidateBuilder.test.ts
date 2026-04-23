import { CandidateBuilder } from '../CandidateBuilder';
import { ElementNode } from '../../domain';

function makeElement(overrides: Partial<ElementNode> = {}): ElementNode {
  return {
    elementId: 'test-id',
    tag: 'button',
    attributes: {},
    locators: [],
    framePath: [],
    ...overrides,
  };
}

describe('CandidateBuilder', () => {
  let builder: CandidateBuilder;

  beforeEach(() => {
    builder = new CandidateBuilder();
  });

  it('generates data-testid candidate', () => {
    const el = makeElement({ attributes: { 'data-testid': 'submit-btn' } });
    const candidates = builder.build(el);
    const found = candidates.find((c) => c.strategy === 'data-testid');
    expect(found).toBeDefined();
    expect(found?.value).toContain('submit-btn');
  });

  it('generates role candidate when role and text present', () => {
    const el = makeElement({
      role: 'button',
      text: 'Submit',
      accessibilityNode: { role: 'button', name: 'Submit' },
    });
    const candidates = builder.build(el);
    const found = candidates.find((c) => c.strategy === 'role');
    expect(found).toBeDefined();
    expect(found?.value).toContain('button');
  });

  it('generates id candidate for non-dynamic ids', () => {
    const el = makeElement({ attributes: { id: 'login-form' } });
    const candidates = builder.build(el);
    const found = candidates.find((c) => c.value === '#login-form');
    expect(found).toBeDefined();
  });

  it('skips UUID-like ids', () => {
    const el = makeElement({ attributes: { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' } });
    const candidates = builder.build(el);
    const found = candidates.find((c) => c.value?.includes('a1b2c3d4-e5f6'));
    expect(found).toBeUndefined();
  });

  it('generates text candidate for short text', () => {
    const el = makeElement({ text: 'Click me' });
    const candidates = builder.build(el);
    const found = candidates.find((c) => c.strategy === 'text');
    expect(found).toBeDefined();
    expect(found?.value).toBe('Click me');
  });

  it('skips text candidate for very long text', () => {
    const el = makeElement({ text: 'A'.repeat(100) });
    const candidates = builder.build(el);
    const found = candidates.find((c) => c.strategy === 'text');
    expect(found).toBeUndefined();
  });
});
