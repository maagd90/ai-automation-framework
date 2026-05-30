import type { TestCase } from '@ai-agent/shared-types';

export interface FeaturePartition {
  /** Normalised feature key, e.g. 'login', 'cart', 'checkout', 'general'. */
  featureName: string;
  testCases: TestCase[];
}

/**
 * Ordered list of [featureKey, keywords] pairs.
 * Evaluation is first-match: a test case is assigned to the first feature
 * whose keyword list contains a substring match against the combined text
 * of the test case name, description, and step targets.
 */
const FEATURE_KEYWORDS: ReadonlyArray<[string, ReadonlyArray<string>]> = [
  ['login',    ['login', 'sign in', 'signin', 'log in', 'authenticate', 'credential']],
  ['logout',   ['logout', 'sign out', 'signout', 'log out']],
  ['register', ['register', 'signup', 'sign up', 'create account', 'registration']],
  ['cart',     ['cart', 'basket', 'shopping cart', 'add to cart', 'remove from cart']],
  ['checkout', ['checkout', 'payment', 'billing', 'place order', 'purchase', 'order confirm']],
  ['search',   ['search', 'filter', 'query', 'find product']],
  ['products', ['product', 'item', 'inventory', 'catalogue', 'catalog', 'listing', 'browse']],
  ['account',  ['account', 'profile', 'settings', 'preferences', 'personal info']],
  ['dashboard',['dashboard', 'home page', 'landing page', 'main page', 'overview']],
];

/**
 * Groups a flat list of test cases into feature partitions based on keyword
 * matching across the test case name, description, and step targets.
 *
 * Unrecognised test cases fall into the 'general' partition.
 * Order of partitions in the result reflects first-encounter order.
 */
export class FeaturePartitioner {
  /**
   * Partitions the given test cases by detected feature.
   *
   * @param testCases - Array of parsed test cases from the uploaded batch.
   * @returns Ordered array of feature partitions, each with a feature name and its test cases.
   */
  partition(testCases: TestCase[]): FeaturePartition[] {
    const groups = new Map<string, TestCase[]>();

    for (const tc of testCases) {
      const feature = this.detectFeature(tc);
      let bucket = groups.get(feature);
      if (!bucket) {
        bucket = [];
        groups.set(feature, bucket);
      }
      bucket.push(tc);
    }

    return Array.from(groups.entries()).map(([featureName, cases]) => ({
      featureName,
      testCases: cases,
    }));
  }

  /**
   * Returns the feature key for a single test case.
   *
   * Combines name, description and step targets into a single lower-cased string
   * and performs substring matching against the keyword table.
   *
   * @param testCase - A single parsed test case.
   * @returns Detected feature key, or 'general' if no keyword matches.
   */
  detectFeature(testCase: TestCase): string {
    const haystack = [
      testCase.name,
      testCase.description ?? '',
      ...(testCase.steps ?? []).map((s) => `${s.target ?? ''} ${s.action ?? ''}`),
    ]
      .join(' ')
      .toLowerCase();

    for (const [feature, keywords] of FEATURE_KEYWORDS) {
      if (keywords.some((kw) => haystack.includes(kw))) {
        return feature;
      }
    }

    return 'general';
  }
}
