import { describe, expect, it } from 'vitest';
import { FeaturePartitioner } from '../../ai-agent-platform/packages/agent-core/src/parsers/FeaturePartitioner';
import type { TestCase } from '@ai-agent/shared-types';

function makeTestCase(name: string, description = ''): TestCase {
  return {
    id: `TC-${name.replace(/\s+/g, '_').toUpperCase()}`,
    name,
    description,
    steps: [],
    expectedResults: [],
  };
}

describe('FeaturePartitioner', () => {
  const partitioner = new FeaturePartitioner();

  describe('detectFeature', () => {
    it('detects login from test name', () => {
      expect(partitioner.detectFeature(makeTestCase('Valid login with valid credentials'))).toBe('login');
    });

    it('detects login from sign in keyword', () => {
      expect(partitioner.detectFeature(makeTestCase('User can sign in successfully'))).toBe('login');
    });

    it('detects logout', () => {
      expect(partitioner.detectFeature(makeTestCase('User logout from account'))).toBe('logout');
    });

    it('detects cart', () => {
      expect(partitioner.detectFeature(makeTestCase('Add product to cart'))).toBe('cart');
    });

    it('detects checkout', () => {
      expect(partitioner.detectFeature(makeTestCase('Complete checkout process'))).toBe('checkout');
    });

    it('detects products', () => {
      expect(partitioner.detectFeature(makeTestCase('Browse product inventory'))).toBe('products');
    });

    it('detects search', () => {
      expect(partitioner.detectFeature(makeTestCase('Search for items'))).toBe('search');
    });

    it('detects account', () => {
      expect(partitioner.detectFeature(makeTestCase('Update user profile settings'))).toBe('account');
    });

    it('falls back to general for unrecognised test', () => {
      expect(partitioner.detectFeature(makeTestCase('Verify page title is correct'))).toBe('general');
    });

    it('matches description when name has no keyword', () => {
      const tc = makeTestCase('TC-001', 'Authenticate with valid credentials');
      expect(partitioner.detectFeature(tc)).toBe('login');
    });
  });

  describe('partition', () => {
    it('groups test cases by detected feature', () => {
      const testCases: TestCase[] = [
        makeTestCase('Login with valid credentials'),
        makeTestCase('Login with invalid password'),
        makeTestCase('Add item to shopping cart'),
        makeTestCase('Browse inventory'),
      ];

      const partitions = partitioner.partition(testCases);

      expect(partitions).toHaveLength(3);

      const loginPartition = partitions.find((p) => p.featureName === 'login');
      expect(loginPartition?.testCases).toHaveLength(2);

      const cartPartition = partitions.find((p) => p.featureName === 'cart');
      expect(cartPartition?.testCases).toHaveLength(1);

      const productsPartition = partitions.find((p) => p.featureName === 'products');
      expect(productsPartition?.testCases).toHaveLength(1);
    });

    it('returns a single general partition when no keywords match', () => {
      const testCases: TestCase[] = [
        makeTestCase('Verify page title'),
        makeTestCase('Check footer links'),
      ];

      const partitions = partitioner.partition(testCases);
      expect(partitions).toHaveLength(1);
      expect(partitions[0].featureName).toBe('general');
      expect(partitions[0].testCases).toHaveLength(2);
    });

    it('handles an empty batch', () => {
      expect(partitioner.partition([])).toHaveLength(0);
    });

    it('preserves first-encounter ordering of features', () => {
      const testCases: TestCase[] = [
        makeTestCase('Checkout order'),
        makeTestCase('Login page test'),
      ];
      const partitions = partitioner.partition(testCases);
      expect(partitions[0].featureName).toBe('checkout');
      expect(partitions[1].featureName).toBe('login');
    });
  });
});
