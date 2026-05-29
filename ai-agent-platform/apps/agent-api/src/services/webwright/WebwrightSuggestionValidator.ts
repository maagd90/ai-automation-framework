import { chromium } from 'playwright';
import { webwrightConfig } from './WebwrightConfig';
import type {
  ParsedWebwrightResult,
  WebwrightAssertionSuggestion,
  WebwrightLocatorSuggestion,
} from './WebwrightResultParser';

export interface WebwrightValidationResult {
  status: ParsedWebwrightResult['status'];
  failureCategory: ParsedWebwrightResult['failureCategory'];
  summary: string;
  approvedLocators: WebwrightLocatorSuggestion[];
  approvedAssertions: WebwrightAssertionSuggestion[];
  rejectedLocators: WebwrightLocatorSuggestion[];
  rejectedAssertions: WebwrightAssertionSuggestion[];
  warnings: string[];
  recommendationsUsed: number;
}

function parseQuotedValue(value: string): string | undefined {
  const match = value.match(/^['"`](.*)['"`]$/);
  return match?.[1];
}

function parseRoleSelector(selector: string): { role: string; name?: string } | null {
  const match = selector.match(/getByRole\(\s*['"`]([^'"`]+)['"`](?:\s*,\s*\{\s*name:\s*['"`]([^'"`]+)['"`]\s*\})?\s*\)/i);
  if (!match) return null;
  return { role: match[1], name: match[2] };
}

function parseStrategyLocator(page: any, suggestion: WebwrightLocatorSuggestion) {
  const selector = suggestion.selector.trim();
  const direct = selector.replace(/^page\./, '');

  if (direct.startsWith('getByTestId(')) {
    const value = parseQuotedValue(direct.slice('getByTestId('.length, -1));
    return value ? page.getByTestId(value) : null;
  }
  if (direct.startsWith('getByLabel(')) {
    const value = parseQuotedValue(direct.slice('getByLabel('.length, -1));
    return value ? page.getByLabel(value) : null;
  }
  if (direct.startsWith('getByPlaceholder(')) {
    const value = parseQuotedValue(direct.slice('getByPlaceholder('.length, -1));
    return value ? page.getByPlaceholder(value) : null;
  }
  if (direct.startsWith('getByText(')) {
    const value = parseQuotedValue(direct.slice('getByText('.length, -1));
    return value ? page.getByText(value) : null;
  }
  if (direct.startsWith('getByRole(')) {
    const parsed = parseRoleSelector(direct);
    return parsed ? page.getByRole(parsed.role as never, parsed.name ? { name: parsed.name } : undefined) : null;
  }
  if (direct.startsWith('locator(')) {
    const value = parseQuotedValue(direct.slice('locator('.length, -1));
    return value ? page.locator(value) : null;
  }
  return null;
}

async function firstPresent(candidates: any[]): Promise<any | null> {
  for (const candidate of candidates) {
    try {
      if (await candidate.count() > 0) return candidate;
    } catch {
      // ignore invalid candidate shapes
    }
  }
  return null;
}

function wantsPostLoginState(suggestion: WebwrightLocatorSuggestion): boolean {
  const haystack = `${suggestion.fieldName} ${suggestion.target} ${suggestion.selector} ${suggestion.reason}`.toLowerCase();
  return /(product|inventory|catalog|shop|cart|checkout|dashboard|order|bag|basket)/.test(haystack);
}

async function maybeWaitForNavigation(page: any): Promise<void> {
  if (typeof page.waitForLoadState === 'function') {
    await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  }
}

async function tryLoginFlow(page: any): Promise<boolean> {
  const password = await firstPresent([
    page.locator('input[type="password"]'),
    page.getByLabel?.('Password'),
    page.getByPlaceholder?.('Password'),
  ]);
  if (!password) return false;

  const username = await firstPresent([
    page.getByLabel?.('Username'),
    page.getByLabel?.('Email'),
    page.getByPlaceholder?.('Username'),
    page.getByPlaceholder?.('Email'),
    page.locator('input[type="email"]'),
    page.locator('input[type="text"]'),
  ]);

  if (username?.fill) {
    await username.fill('webwright-user').catch(() => undefined);
  }
  if (password?.fill) {
    await password.fill('webwright-pass').catch(() => undefined);
  }

  const submit = await firstPresent([
    page.getByRole?.('button', { name: 'Login' }),
    page.getByRole?.('button', { name: 'Sign in' }),
    page.getByRole?.('button', { name: 'Sign In' }),
    page.getByRole?.('button', { name: 'Submit' }),
    page.locator('button[type="submit"]'),
    page.locator('input[type="submit"]'),
  ]);
  if (submit?.click) {
    await submit.click().catch(() => undefined);
    await maybeWaitForNavigation(page);
    return true;
  }
  return false;
}

async function tryOpenCatalog(page: any): Promise<boolean> {
  const catalog = await firstPresent([
    page.getByRole?.('link', { name: 'Products' }),
    page.getByRole?.('button', { name: 'Products' }),
    page.getByRole?.('link', { name: 'Catalog' }),
    page.getByRole?.('button', { name: 'Catalog' }),
    page.getByRole?.('link', { name: 'Shop' }),
    page.getByRole?.('button', { name: 'Shop' }),
    page.locator('a[href*="product"]'),
    page.locator('a[href*="catalog"]'),
  ]);
  if (!catalog?.click) return false;
  await catalog.click().catch(() => undefined);
  await maybeWaitForNavigation(page);
  return true;
}

async function tryOpenCart(page: any): Promise<boolean> {
  const cart = await firstPresent([
    page.getByRole?.('link', { name: 'Cart' }),
    page.getByRole?.('button', { name: 'Cart' }),
    page.getByRole?.('link', { name: 'Basket' }),
    page.getByRole?.('button', { name: 'Basket' }),
    page.getByRole?.('link', { name: 'Bag' }),
    page.getByRole?.('button', { name: 'Bag' }),
  ]);
  if (!cart?.click) return false;
  await cart.click().catch(() => undefined);
  await maybeWaitForNavigation(page);
  return true;
}

async function tryAddProduct(page: any): Promise<boolean> {
  const addToCart = await firstPresent([
    page.getByRole?.('button', { name: 'Add to cart' }),
    page.getByRole?.('button', { name: 'Add to Cart' }),
    page.getByRole?.('button', { name: 'Add item' }),
    page.locator('button[name*="cart" i]'),
    page.locator('button:has-text("Add")'),
  ]);
  if (!addToCart?.click) return false;
  await addToCart.click().catch(() => undefined);
  return true;
}

export class WebwrightSuggestionValidator {
  constructor(private readonly launchBrowser: () => Promise<any> = () => chromium.launch({ headless: true })) {}

  async validate(
    result: ParsedWebwrightResult,
    targetUrl: string,
  ): Promise<WebwrightValidationResult> {
    const browser = await this.launchBrowser();
    const page = await browser.newPage();
    const warnings = [...result.warnings];
    const approvedLocators: WebwrightLocatorSuggestion[] = [];
    const rejectedLocators: WebwrightLocatorSuggestion[] = [];
    const approvedAssertions: WebwrightAssertionSuggestion[] = [];
    const rejectedAssertions: WebwrightAssertionSuggestion[] = [];

    try {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: webwrightConfig.WEBWRIGHT_TIMEOUT_SECONDS * 1000 });

      for (const locator of result.suggestedLocators) {
        if (locator.confidenceScore < webwrightConfig.WEBWRIGHT_MIN_CONFIDENCE) {
          rejectedLocators.push(locator);
          warnings.push(`Locator ${locator.fieldName} below min confidence`);
          continue;
        }

        const loc = parseStrategyLocator(page, locator);
        if (!loc) {
          rejectedLocators.push(locator);
          warnings.push(`Unable to parse selector for ${locator.fieldName}`);
          continue;
        }

        const count = await loc.count();
        if (count > 0) {
          approvedLocators.push(locator);
          continue;
        }

        const prerequisiteFlows: Array<() => Promise<boolean>> = [() => tryLoginFlow(page)];
        if (wantsPostLoginState(locator)) {
          prerequisiteFlows.push(() => tryOpenCatalog(page), () => tryAddProduct(page), () => tryOpenCart(page));
        }

        let resolved = false;
        for (const flow of prerequisiteFlows) {
          if (!(await flow())) continue;
          if (await loc.count() > 0) {
            resolved = true;
            break;
          }
        }

        if (resolved) {
          approvedLocators.push(locator);
        } else {
          rejectedLocators.push(locator);
          warnings.push(`Locator ${locator.fieldName} did not resolve even after prerequisite flow attempts`);
        }
      }

      for (const assertion of result.suggestedAssertions) {
        const selector = assertion.assertion.match(/this\.(page|[A-Za-z0-9_]+)\.locator\((['"`].*['"`])\)/)?.[2];
        const parsedSelector = selector ? parseQuotedValue(selector) : undefined;
        if (parsedSelector && await page.locator(parsedSelector).count() > 0) {
          approvedAssertions.push(assertion);
          continue;
        }

        const prerequisiteFlows: Array<() => Promise<boolean>> = [() => tryLoginFlow(page)];
        if (wantsPostLoginState({
          pageObject: assertion.pageObject,
          fieldName: assertion.methodName,
          target: assertion.assertion,
          selector: assertion.assertion,
          reason: assertion.reason,
          confidenceScore: 1,
          strategy: 'getByRole',
        })) {
          prerequisiteFlows.push(() => tryOpenCatalog(page), () => tryAddProduct(page), () => tryOpenCart(page));
        }

        let resolved = false;
        for (const flow of prerequisiteFlows) {
          if (!(await flow())) continue;
          if (parsedSelector && await page.locator(parsedSelector).count() > 0) {
            resolved = true;
            break;
          }
        }

        if (resolved || assertion.assertion.includes('toBeVisible') || assertion.assertion.includes('toHaveText')) {
          approvedAssertions.push(assertion);
        } else {
          rejectedAssertions.push(assertion);
          warnings.push(`Assertion ${assertion.methodName} could not be validated`);
        }
      }
    } finally {
      await page.close();
      await browser.close();
    }

    const recommendationsUsed = approvedLocators.length + approvedAssertions.length;
    return {
      status: recommendationsUsed > 0 ? result.status : 'failed',
      failureCategory: result.failureCategory,
      summary: result.summary,
      approvedLocators,
      approvedAssertions,
      rejectedLocators,
      rejectedAssertions,
      warnings,
      recommendationsUsed,
    };
  }
}
