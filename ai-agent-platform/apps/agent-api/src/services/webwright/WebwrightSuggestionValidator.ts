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

function wantsPrerequisiteFlow(suggestion: WebwrightLocatorSuggestion | WebwrightAssertionSuggestion): boolean {
  const haystack = `${suggestion.pageObject} ${'selector' in suggestion ? suggestion.selector : suggestion.assertion} ${suggestion.reason}`.toLowerCase();
  return /login|sign in|sign-in|auth|account|profile|product|catalog|shop|cart|checkout|dashboard|order|basket|bag/.test(haystack);
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

async function attemptLoginFlow(page: any): Promise<boolean> {
  const password = await firstPresent([
    page.locator('input[type="password"]'),
  ]);
  if (!password) return false;

  const username = await firstPresent([
    page.locator('input[type="email"]'),
    page.locator('input[type="text"]'),
    // Some browsers/web apps omit the type attribute, which defaults to text.
    page.locator('input:not([type])'),
  ]);

  if (username?.fill) {
    await username.fill('webwright-user').catch(() => undefined);
  }
  if (password?.fill) {
    await password.fill('webwright-pass').catch(() => undefined);
  }

  const submit = await firstPresent([
    page.locator('button[type="submit"]'),
    page.locator('input[type="submit"]'),
    page.locator('form button'),
  ]);
  if (!submit) return false;

  await submit.click().catch(() => undefined);
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  return true;
}

async function attemptPageAdvance(page: any): Promise<boolean> {
  const candidates = await firstPresent([
    page.getByRole?.('link'),
    page.getByRole?.('button'),
  ]);
  if (!candidates) return false;

  try {
    await candidates.first().click().catch(() => undefined);
    await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

async function resolvePrerequisites(page: any, suggestion: WebwrightLocatorSuggestion | WebwrightAssertionSuggestion): Promise<void> {
  if (!wantsPrerequisiteFlow(suggestion)) {
    return;
  }

  await attemptLoginFlow(page);
  const advanced = await attemptPageAdvance(page);
  if (advanced) {
    await attemptPageAdvance(page);
  }
}

async function validateLocator(page: any, locator: WebwrightLocatorSuggestion): Promise<boolean> {
  const loc = parseStrategyLocator(page, locator);
  if (!loc) return false;
  return (await loc.count()) > 0;
}

async function validateAssertion(page: any, assertion: WebwrightAssertionSuggestion): Promise<boolean> {
  const selector = assertion.assertion.match(/this\.(page|[A-Za-z0-9_]+)\.locator\((['"`].*['"`])\)/)?.[2];
  const parsedSelector = selector ? parseQuotedValue(selector) : undefined;
  if (!parsedSelector) {
    return assertion.assertion.includes('toBeVisible') || assertion.assertion.includes('toHaveText');
  }
  return (await page.locator(parsedSelector).count()) > 0;
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

        if (await validateLocator(page, locator)) {
          approvedLocators.push(locator);
          continue;
        }

        await resolvePrerequisites(page, locator);
        if (await validateLocator(page, locator)) {
          approvedLocators.push(locator);
        } else {
          rejectedLocators.push(locator);
          warnings.push(`Locator ${locator.fieldName} did not resolve after prerequisite flow attempts`);
        }
      }

      for (const assertion of result.suggestedAssertions) {
        if (await validateAssertion(page, assertion)) {
          approvedAssertions.push(assertion);
          continue;
        }

        await resolvePrerequisites(page, assertion);
        if (await validateAssertion(page, assertion)) {
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
