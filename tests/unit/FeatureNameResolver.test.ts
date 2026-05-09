import { describe, expect, it } from 'vitest';
import { FeatureNameResolver } from '../../src/core/generator/FeatureNameResolver';
import type { TestCase } from '../../src/core/domain/TestCase';

const makeTestCase = (overrides: Partial<TestCase> = {}): TestCase => ({
  name: 'Login with valid credentials',
  preconditions: [],
  steps: [],
  expectedResults: [],
  ...overrides,
});

describe('FeatureNameResolver', () => {
  const resolver = new FeatureNameResolver();

  it('prefers explicit feature metadata', () => {
    const feature = resolver.resolve({
      testCase: makeTestCase({ feature: 'checkout' }),
      url: 'https://example.com/',
      explicitFeatureName: 'login',
    });
    expect(feature).toBe('login');
  });

  it('detects login feature from test case semantics', () => {
    const feature = resolver.resolve({
      testCase: makeTestCase({
        steps: [
          { order: 1, action: 'enter', target: 'Username field', value: 'standard_user' },
          { order: 2, action: 'enter', target: 'Password field', value: 'secret_sauce' },
        ],
      }),
      url: 'https://www.saucedemo.com/',
    });
    expect(feature).toBe('login');
  });

  it('falls back to URL path when text signals are absent', () => {
    const feature = resolver.resolve({
      testCase: makeTestCase({ name: 'Open page', steps: [{ order: 1, action: 'click', target: 'Open page' }] }),
      url: 'https://example.com/products',
    });
    expect(feature).toBe('products');
  });
});
