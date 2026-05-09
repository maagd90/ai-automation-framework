import type { TestCase } from '../domain/TestCase.js';
import { StringUtils } from '../../utils/StringUtils.js';

export interface FeatureNameContext {
  testCase: TestCase;
  url: string;
  explicitFeatureName?: string;
}

const FEATURE_KEYWORDS: Array<{ feature: string; keywords: string[] }> = [
  { feature: 'login', keywords: ['login', 'log in', 'sign in', 'signin', 'authenticate', 'username', 'password'] },
  { feature: 'logout', keywords: ['logout', 'log out', 'sign out', 'signout'] },
  { feature: 'register', keywords: ['register', 'registration', 'sign up', 'signup', 'create account'] },
  { feature: 'checkout', keywords: ['checkout', 'payment', 'billing', 'shipping', 'place order'] },
  { feature: 'cart', keywords: ['cart', 'basket', 'bag', 'remove from cart', 'add to cart'] },
  { feature: 'search', keywords: ['search', 'filter', 'find', 'query'] },
  { feature: 'products', keywords: ['product', 'inventory', 'catalog', 'item', 'sort products'] },
  { feature: 'account', keywords: ['account', 'profile', 'settings', 'user profile'] },
  { feature: 'dashboard', keywords: ['dashboard', 'overview', 'home dashboard'] },
];

export class FeatureNameResolver {
  resolve(context: FeatureNameContext): string {
    const explicit = this.normalizeFeatureName(
      context.explicitFeatureName
      ?? process.env.GENERATED_FEATURE_NAME
      ?? context.testCase.feature
      ?? context.testCase.module,
    );
    if (explicit) return explicit;

    const categoryFeature = this.normalizeFeatureName(context.testCase.category);
    if (categoryFeature) return categoryFeature;

    const textFeature = this.resolveFromText([
      context.testCase.name,
      context.testCase.feature,
      context.testCase.module,
      context.testCase.category,
      ...context.testCase.preconditions,
      ...context.testCase.steps.map((step) => step.target),
      ...context.testCase.expectedResults,
    ]);
    if (textFeature) return textFeature;

    const urlFeature = this.resolveFromUrl(context.url);
    if (urlFeature) return urlFeature;

    return 'home';
  }

  private resolveFromText(values: Array<string | undefined>): string | undefined {
    const corpus = values.filter(Boolean).map((value) => StringUtils.normalize(value!)).join(' ');
    if (!corpus) return undefined;

    for (const candidate of FEATURE_KEYWORDS) {
      if (candidate.keywords.some((keyword) => corpus.includes(StringUtils.normalize(keyword)))) {
        return candidate.feature;
      }
    }

    return undefined;
  }

  private resolveFromUrl(url: string): string | undefined {
    try {
      const parsed = new URL(url);
      const segments = parsed.pathname
        .split('/')
        .map((segment) => segment.trim())
        .filter(Boolean)
        .map((segment) => this.normalizeFeatureName(segment))
        .filter(Boolean) as string[];

      return segments[segments.length - 1];
    } catch {
      return undefined;
    }
  }

  private normalizeFeatureName(value?: string): string | undefined {
    if (!value) return undefined;
    const normalized = StringUtils.toKebabCase(value);
    return normalized || undefined;
  }
}
