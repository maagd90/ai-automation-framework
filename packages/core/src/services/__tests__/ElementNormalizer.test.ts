import { ElementNormalizer } from '../ElementNormalizer';

const normalizer = new ElementNormalizer();

describe('ElementNormalizer', () => {
  it('normalizes a basic button element', () => {
    const result = normalizer.normalize({ tag: 'button', text: 'Login', attributes: {}, framePath: [] });
    expect(result.tag).toBe('button');
    expect(result.text).toBe('Login');
  });

  it('merges accessibility data', () => {
    const a11y = { role: 'button', name: 'Submit' };
    const result = normalizer.normalize({ tag: 'button', attributes: {}, framePath: [] }, a11y);
    expect(result.role).toBe('button');
    expect(result.ariaLabel).toBe('Submit');
    expect(result.a11y).toEqual(a11y);
  });

  it('provides sensible defaults for missing fields', () => {
    const result = normalizer.normalize({});
    expect(result.tag).toBe('div');
    expect(result.attributes).toEqual({});
    expect(result.framePath).toEqual([]);
  });
});
