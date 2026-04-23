import { ElementNormalizer } from '../ElementNormalizer';

describe('ElementNormalizer', () => {
  let normalizer: ElementNormalizer;

  beforeEach(() => {
    normalizer = new ElementNormalizer();
  });

  it('normalizes a basic element', () => {
    const raw = {
      tag: 'button',
      text: 'Submit',
      attributes: { type: 'submit', 'data-testid': 'submit-btn' },
    };
    const node = normalizer.normalize(raw);
    expect(node.tag).toBe('button');
    expect(node.text).toBe('Submit');
    expect(node.elementId).toBeDefined();
  });

  it('includes accessibility node when provided', () => {
    const raw = { tag: 'input', attributes: { type: 'email' } };
    const a11y = { role: 'textbox', name: 'Email' };
    const node = normalizer.normalize(raw, a11y);
    expect(node.accessibilityNode).toBeDefined();
    expect(node.accessibilityNode?.role).toBe('textbox');
  });

  it('trims whitespace from text', () => {
    const raw = { tag: 'button', text: '  Click me  ', attributes: {} };
    const node = normalizer.normalize(raw);
    expect(node.text).toBe('Click me');
  });

  it('generates consistent elementId for same inputs', () => {
    const raw = { tag: 'button', attributes: { 'data-testid': 'btn' } };
    const node1 = normalizer.normalize(raw);
    const node2 = normalizer.normalize(raw);
    expect(node1.elementId).toBe(node2.elementId);
  });
});
