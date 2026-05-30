import { chromium } from 'playwright';
import { webwrightConfig } from './WebwrightConfig';
import type {
  ParsedWebwrightResult,
  WebwrightAssertionSuggestion,
  WebwrightLocatorSuggestion,
} from './WebwrightResultParser';
import type { WebwrightGeneratedDataSnapshot } from './WebwrightGeneratedDataExtractor';
import type { WebwrightReplayPlan } from './WebwrightStepReplayPlanBuilder';

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

export interface WebwrightValidationOptions {
  generatedData?: WebwrightGeneratedDataSnapshot;
  replayPlan?: WebwrightReplayPlan;
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

function parseStrategyLocator(page: any, suggestion: WebwrightLocatorSuggestion | { selector: string }) {
  const selector = suggestion.selector.trim();
  const direct = selector.replace(/^page\./, '').replace(/^this\.page\./, '');

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
  if (direct.startsWith('page.locator(') || direct.startsWith('page.getBy')) {
    return parseStrategyLocator(page, { selector: direct });
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

function resolveValue(ref: string | undefined, generatedData?: WebwrightGeneratedDataSnapshot): string | undefined {
  if (!ref || !generatedData) return undefined;
  const parts = ref.split('.');
  if (parts.length === 2 && (parts[0] === 'validUser' || parts[0] === 'invalidUser')) {
    const bucket = generatedData.credentials[parts[0]];
    const value = bucket[parts[1] as keyof typeof bucket];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
  if (parts[0] === 'inputs' && parts[1]) {
    const value = generatedData.inputs[parts[1]];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
  return undefined;
}

async function applyReplayPlan(page: any, plan: WebwrightReplayPlan, generatedData?: WebwrightGeneratedDataSnapshot, warnings: string[] = []): Promise<void> {
  for (const step of plan.steps) {
    try {
      if (step.action === 'navigate') {
        continue;
      }

      if (!step.selector) {
        warnings.push(`Replay step "${step.action} ${step.target}" is missing a selector`);
        continue;
      }

      const locator = parseStrategyLocator(page, { selector: step.selector });
      if (!locator) {
        warnings.push(`Replay selector could not be resolved: ${step.selector}`);
        continue;
      }

      if (step.action === 'fill') {
        const value = resolveValue(step.valueRef, generatedData);
        if (value === undefined) {
          warnings.push(`Replay value reference could not be resolved: ${step.valueRef ?? '(missing)'}`);
          continue;
        }
        await locator.fill(value);
        continue;
      }

      if (step.action === 'select') {
        const value = resolveValue(step.valueRef, generatedData) ?? step.valueRef;
        if (!value) {
          warnings.push(`Replay select step missing value reference for ${step.target}`);
          continue;
        }
        await locator.selectOption(value);
        continue;
      }

      if (step.action === 'check') {
        await locator.check();
        continue;
      }

      if (step.action === 'uncheck') {
        await locator.uncheck();
        continue;
      }

      if (step.action === 'assertVisible') {
        await locator.waitFor({ state: 'visible' });
        continue;
      }

      if (step.action === 'assertText') {
        await locator.waitFor({ state: 'visible' });
        continue;
      }

      await locator.click();
    } catch (err) {
      warnings.push(`Replay step failed for "${step.target}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function validateLocator(page: any, locator: WebwrightLocatorSuggestion): Promise<boolean> {
  const loc = parseStrategyLocator(page, locator);
  if (!loc) return false;
  return (await loc.count()) > 0;
}

async function validateAssertion(page: any, assertion: WebwrightAssertionSuggestion): Promise<boolean> {
  const selector = assertion.assertion.match(/this\.(page|[A-Za-z0-9_]+)\.(locator|getByRole|getByLabel|getByPlaceholder|getByText|getByTestId)\(([^)]+)\)/);
  const directSelector = selector ? `page.${selector[2]}(${selector[3]})` : undefined;
  const parsedSelector = directSelector ?? assertion.assertion.match(/page\.(locator|getByRole|getByLabel|getByPlaceholder|getByText|getByTestId)\(([^)]+)\)/)?.[0];
  if (!parsedSelector) {
    return assertion.assertion.includes('toBeVisible') || assertion.assertion.includes('toHaveText');
  }
  const locator = parseStrategyLocator(page, { selector: parsedSelector });
  return locator ? (await locator.count()) > 0 : false;
}

export class WebwrightSuggestionValidator {
  constructor(private readonly launchBrowser: () => Promise<any> = () => chromium.launch({ headless: true })) {}

  async validate(
    result: ParsedWebwrightResult,
    targetUrl: string,
    options: WebwrightValidationOptions = {},
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

      if (options.replayPlan) {
        await applyReplayPlan(page, options.replayPlan, options.generatedData, warnings);
      }

      for (const locator of result.suggestedLocators) {
        if (locator.confidenceScore < webwrightConfig.WEBWRIGHT_MIN_CONFIDENCE) {
          rejectedLocators.push(locator);
          warnings.push(`Locator ${locator.fieldName} below min confidence`);
          continue;
        }

        if (await validateLocator(page, locator)) {
          approvedLocators.push(locator);
        } else {
          rejectedLocators.push(locator);
          warnings.push(`Locator ${locator.fieldName} did not resolve after replay steps`);
        }
      }

      for (const assertion of result.suggestedAssertions) {
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
