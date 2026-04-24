import { describe, it, expect } from 'vitest';
import { LocatorCandidateBuilder } from '../../src/core/locator/LocatorCandidateBuilder.js';
import type { ElementNode } from '../../src/core/domain/ElementNode.js';

const makeElement = (overrides: Partial<ElementNode>): ElementNode => ({
  tagName: 'input',
  text: '',
  visible: true,
  enabled: true,
  ...overrides,
});

describe('LocatorCandidateBuilder', () => {
  const builder = new LocatorCandidateBuilder();

  it('generates getByTestId candidate when data-testid is present', () => {
    const el = makeElement({ dataTestId: 'email-input' });
    const candidates = builder.build(el);
    const c = candidates.find(c => c.strategy === 'getByTestId');
    expect(c).toBeDefined();
    expect(c?.value).toBe('email-input');
  });

  it('generates getByPlaceholder candidate when placeholder is present', () => {
    const el = makeElement({ placeholder: 'Email' });
    const candidates = builder.build(el);
    const c = candidates.find(c => c.strategy === 'getByPlaceholder');
    expect(c).toBeDefined();
  });

  it('generates cssId candidate for stable id', () => {
    const el = makeElement({ id: 'email-field' });
    const candidates = builder.build(el);
    const c = candidates.find(c => c.strategy === 'cssId');
    expect(c).toBeDefined();
    expect(c?.value).toBe('#email-field');
  });

  it('does NOT generate cssId for dynamic/numeric id', () => {
    const el = makeElement({ id: '123456' });
    const candidates = builder.build(el);
    const c = candidates.find(c => c.strategy === 'cssId');
    expect(c).toBeUndefined();
  });

  it('generates multiple candidates per element', () => {
    const el = makeElement({ dataTestId: 'btn', placeholder: 'Email', tagName: 'input' });
    const candidates = builder.build(el);
    expect(candidates.length).toBeGreaterThan(1);
  });
});
