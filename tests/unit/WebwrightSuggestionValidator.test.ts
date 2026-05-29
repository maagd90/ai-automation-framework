import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const state = { phase: 'login' };

function makeLocator(selector: string) {
  return {
    async count() {
      if (selector.includes('input[type="password"]')) return state.phase === 'login' ? 1 : 0;
      if (selector.includes('input[type="text"]') || selector.includes('input[type="email"]')) return state.phase === 'login' ? 1 : 0;
      if (selector.includes('Login') || selector.includes('Sign in') || selector.includes('Submit')) return state.phase === 'login' ? 1 : 0;
      if (selector.includes('Cart')) return state.phase === 'products' || state.phase === 'cart' ? 1 : 0;
      return 0;
    },
    async fill(_value: string) {
      return undefined;
    },
    async click() {
      if (selector.includes('Login') || selector.includes('Sign in') || selector.includes('Submit')) {
        state.phase = 'products';
      }
      if (selector.includes('Cart')) {
        state.phase = 'cart';
      }
      return undefined;
    },
  };
}

const mockPage = {
  async goto() {
    state.phase = 'login';
  },
  async close() {
    return undefined;
  },
  async waitForLoadState() {
    return undefined;
  },
  locator(selector: string) {
    return makeLocator(selector);
  },
  getByRole(role: string, options?: { name?: string }) {
    return makeLocator(`${role}:${options?.name ?? ''}`);
  },
  getByLabel(label: string) {
    return makeLocator(`label:${label}`);
  },
  getByPlaceholder(placeholder: string) {
    return makeLocator(`placeholder:${placeholder}`);
  },
  getByTestId(testId: string) {
    return makeLocator(`testid:${testId}`);
  },
};

const browser = {
  newPage: async () => mockPage,
  close: async () => undefined,
};

describe('WebwrightSuggestionValidator', () => {
  beforeEach(() => {
    state.phase = 'login';
  });

  afterEach(() => {
    state.phase = 'login';
  });

  it('validates post-login locators after prerequisite flow', async () => {
    const { WebwrightSuggestionValidator } = await import('../../ai-agent-platform/apps/agent-api/src/services/webwright/WebwrightSuggestionValidator');
    const validator = new WebwrightSuggestionValidator(async () => browser as never);
    const result = await validator.validate(
      {
        status: 'passed',
        failureCategory: 'locator',
        summary: 'ok',
        suggestedLocators: [
          {
            pageObject: 'ProductsPage',
            fieldName: 'cartButton',
            target: 'Cart button',
            selector: "page.getByRole('button', { name: 'Cart' })",
            strategy: 'getByRole',
            confidenceScore: 0.9,
            reason: 'post-login cart control',
          },
        ],
        suggestedAssertions: [],
        patchSuggestions: [],
        warnings: [],
        screenshots: [],
        recommendedLocators: [],
        recommendedAssertions: [],
        discoveredPages: [],
        repairSuggestions: [],
      },
      'https://example.com',
    );

    expect(result.approvedLocators).toHaveLength(1);
    expect(result.rejectedLocators).toHaveLength(0);
  });
});
