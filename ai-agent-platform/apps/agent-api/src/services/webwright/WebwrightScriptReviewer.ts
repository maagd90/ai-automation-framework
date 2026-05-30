import type { LocatorResult, AssertionPlan } from './WebwrightResultParser';

export interface ReviewIssue {
  type: 'low-confidence' | 'weak-assertion' | 'generic-selector' | 'duplicate-selector';
  message: string;
  selector: string;
}

export interface ScriptReviewResult {
  approved: LocatorResult[];
  rejected: LocatorResult[];
  approvedAssertions: AssertionPlan[];
  rejectedAssertions: AssertionPlan[];
  issues: ReviewIssue[];
}

const CONFIDENCE_THRESHOLD = 0.6;
const WEAK_ASSERTION_TYPES = new Set(['toHaveURL']);

/**
 * CSS selectors that are considered too generic to be reliable locators.
 * Bare tag selectors (e.g. 'button', 'input', 'a', 'BUTTON') match many elements at once
 * and are intentionally treated as generic — prefer role/label/data-test selectors.
 * The tag-name pattern is case-insensitive to catch uppercase/mixed-case variants.
 */
const GENERIC_SELECTOR_PATTERNS = [/^\.[\w-]+$/, /^#\S+$/, /^[a-z]+$/i];

function isGenericSelector(selector: string): boolean {
  return GENERIC_SELECTOR_PATTERNS.some((pattern) => pattern.test(selector.trim()));
}

/**
 * Reviews suggested locators and assertions from WebwrightResultParser output.
 *
 * Approves/rejects each suggestion based on confidence, specificity, and
 * assertion strength. This prevents weak or low-quality recommendations from
 * polluting the generated framework.
 */
export class WebwrightScriptReviewer {
  /**
   * Reviews the suggested locators and assertions.
   *
   * @param locators - Validated locator results from the parser.
   * @param assertions - Validated assertion plans from the parser.
   * @returns A split view of approved/rejected suggestions plus a list of issues.
   */
  review(locators: LocatorResult[], assertions: AssertionPlan[]): ScriptReviewResult {
    const issues: ReviewIssue[] = [];
    const seenSelectors = new Set<string>();

    const approved: LocatorResult[] = [];
    const rejected: LocatorResult[] = [];

    for (const locator of locators) {
      if (locator.confidence < CONFIDENCE_THRESHOLD) {
        issues.push({
          type: 'low-confidence',
          message: `Locator "${locator.selector}" has confidence ${locator.confidence.toFixed(2)} — below threshold ${CONFIDENCE_THRESHOLD}`,
          selector: locator.selector,
        });
        rejected.push(locator);
        continue;
      }

      if (isGenericSelector(locator.selector)) {
        issues.push({
          type: 'generic-selector',
          message: `Locator "${locator.selector}" is too generic — prefer role/label/data-test selectors`,
          selector: locator.selector,
        });
        rejected.push(locator);
        continue;
      }

      if (seenSelectors.has(locator.selector)) {
        issues.push({
          type: 'duplicate-selector',
          message: `Duplicate locator selector "${locator.selector}" — only the first occurrence is kept`,
          selector: locator.selector,
        });
        rejected.push(locator);
        continue;
      }

      seenSelectors.add(locator.selector);
      approved.push(locator);
    }

    const approvedAssertions: AssertionPlan[] = [];
    const rejectedAssertions: AssertionPlan[] = [];

    for (const assertion of assertions) {
      if (WEAK_ASSERTION_TYPES.has(assertion.assertionType) && !assertion.expectedValue) {
        issues.push({
          type: 'weak-assertion',
          message: `Assertion "${assertion.description}" uses ${assertion.assertionType} without an expected value — too weak`,
          selector: assertion.selector,
        });
        rejectedAssertions.push(assertion);
        continue;
      }
      approvedAssertions.push(assertion);
    }

    return { approved, rejected, approvedAssertions, rejectedAssertions, issues };
  }
}
