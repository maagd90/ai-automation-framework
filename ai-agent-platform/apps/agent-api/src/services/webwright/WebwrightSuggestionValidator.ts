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

export class WebwrightSuggestionValidator {
  async validate(
    result: ParsedWebwrightResult,
    targetUrl: string,
  ): Promise<WebwrightValidationResult> {
    const browser = await chromium.launch({ headless: true });
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
        } else {
          rejectedLocators.push(locator);
          warnings.push(`Locator ${locator.fieldName} did not resolve on the live page`);
        }
      }

      for (const assertion of result.suggestedAssertions) {
        const selector = assertion.assertion.match(/this\.(page|[A-Za-z0-9_]+)\.locator\((['"`].*['"`])\)/)?.[2];
        if (selector && await page.locator(JSON.parse(selector)).count() > 0) {
          approvedAssertions.push(assertion);
          continue;
        }
        if (assertion.assertion.includes('toBeVisible') || assertion.assertion.includes('toHaveText')) {
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
