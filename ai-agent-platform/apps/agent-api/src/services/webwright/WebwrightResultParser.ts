import type { WebwrightFailureCategory } from './WebwrightFailureClassifier';

export type WebwrightStatus = 'passed' | 'failed' | 'partial';
export type WebwrightStrategy =
  | 'getByTestId'
  | 'getByRole'
  | 'getByLabel'
  | 'getByPlaceholder'
  | 'getByText'
  | 'css'
  | 'xpath';

export interface WebwrightLocatorSuggestion {
  pageObject: string;
  fieldName: string;
  target: string;
  selector: string;
  strategy: WebwrightStrategy;
  confidenceScore: number;
  reason: string;
  legacyStrategy?: string;
}

export interface WebwrightAssertionSuggestion {
  pageObject: string;
  methodName: string;
  assertion: string;
  reason: string;
  assertionType?: string;
}

// Legacy compatibility types used by the existing sidecar service and tests.
export interface LocatorResult {
  selector: string;
  strategy: string;
  page: string;
  confidence: number;
  description?: string;
}

export interface AssertionPlan {
  description: string;
  selector: string;
  assertionType: string;
  expectedValue?: string;
  page: string;
}

export interface WebwrightPatchSuggestion {
  pageObject: string;
  filePath?: string;
  action: 'update-locator' | 'add-assertion-method' | 'replace-assertion' | 'update-locator-json';
  selector?: string;
  reason: string;
}

export interface ParsedWebwrightResult {
  status: WebwrightStatus;
  failureCategory: WebwrightFailureCategory;
  summary: string;
  suggestedLocators: WebwrightLocatorSuggestion[];
  suggestedAssertions: WebwrightAssertionSuggestion[];
  patchSuggestions: WebwrightPatchSuggestion[];
  warnings: string[];
  screenshots: string[];
  // Legacy aliases kept for backward compatibility with existing consumers/tests.
  recommendedLocators: LocatorResult[];
  recommendedAssertions: AssertionPlan[];
  discoveredPages: Array<{
    pageName: string;
    pageClass: string;
    elements: string[];
  }>;
  repairSuggestions: Array<{
    brokenSelector: string;
    suggestedSelector: string;
    strategy: string;
    reason: string;
  }>;
}

interface RawWebwrightOutput {
  status?: unknown;
  failureCategory?: unknown;
  summary?: unknown;
  suggestedLocators?: unknown;
  suggestedAssertions?: unknown;
  patchSuggestions?: unknown;
  warnings?: unknown;
  // legacy keys
  recommendedLocators?: unknown;
  recommendedAssertions?: unknown;
  discoveredPages?: unknown;
  repairSuggestions?: unknown;
  screenshots?: unknown;
}

const VALID_STATUSES = new Set<WebwrightStatus>(['passed', 'failed', 'partial']);
const VALID_FAILURE_CATEGORIES = new Set<WebwrightFailureCategory>([
  'locator',
  'assertion',
  'navigation',
  'page-state',
  'unknown',
]);
const VALID_STRATEGIES = new Set<WebwrightStrategy>([
  'getByTestId',
  'getByRole',
  'getByLabel',
  'getByPlaceholder',
  'getByText',
  'css',
  'xpath',
]);
const STRATEGY_ALIASES: Record<string, WebwrightStrategy> = {
  role: 'getByRole',
  label: 'getByLabel',
  placeholder: 'getByPlaceholder',
  text: 'getByText',
  css: 'css',
  xpath: 'xpath',
  'data-test': 'getByTestId',
  'data-testid': 'getByTestId',
  getByTestId: 'getByTestId',
  getByRole: 'getByRole',
  getByLabel: 'getByLabel',
  getByPlaceholder: 'getByPlaceholder',
  getByText: 'getByText',
};

function normalizeStrategy(raw: unknown): WebwrightStrategy | null {
  const key = String(raw ?? '').trim();
  if (VALID_STRATEGIES.has(key as WebwrightStrategy)) {
    return key as WebwrightStrategy;
  }
  return STRATEGY_ALIASES[key] ?? null;
}

function normalizeConfidence(raw: unknown): number | null {
  if (typeof raw !== 'number' || Number.isNaN(raw) || !Number.isFinite(raw)) return null;
  if (raw < 0) return null;
  if (raw <= 1) return raw;
  if (raw <= 100) return raw / 100;
  return null;
}

function deriveFieldName(pageObject: string, selector: string, target?: string): string {
  const source = target || selector || pageObject;
  const tokens = source
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return 'locator';
  return tokens
    .map((token, index) =>
      index === 0
        ? token.charAt(0).toLowerCase() + token.slice(1)
        : token.charAt(0).toUpperCase() + token.slice(1),
    )
    .join('')
    .replace(/^(page|button|input|field)$/i, 'locator');
}

function derivePageClass(pageObject: string): string {
  if (pageObject.endsWith('Page')) return pageObject;
  return `${pageObject.replace(/[^a-zA-Z0-9]/g, '')}Page`;
}

function parseStringArray(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : [];
}

export class WebwrightResultParser {
  parse(rawJson: string): ParsedWebwrightResult {
    let raw: RawWebwrightOutput;
    try {
      raw = JSON.parse(rawJson) as RawWebwrightOutput;
    } catch {
      throw new Error('Webwright sidecar returned invalid JSON output');
    }

    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new Error('Webwright sidecar output must be a JSON object');
    }

    const warnings = parseStringArray(raw.warnings);

    const status = VALID_STATUSES.has(raw.status as WebwrightStatus)
      ? (raw.status as WebwrightStatus)
      : 'failed';
    if (raw.status !== undefined && !VALID_STATUSES.has(raw.status as WebwrightStatus)) {
      warnings.push(`Unknown status value "${String(raw.status)}" — defaulting to "failed"`);
    }

    const failureCategory = VALID_FAILURE_CATEGORIES.has(raw.failureCategory as WebwrightFailureCategory)
      ? (raw.failureCategory as WebwrightFailureCategory)
      : 'unknown';
    if (raw.failureCategory !== undefined && !VALID_FAILURE_CATEGORIES.has(raw.failureCategory as WebwrightFailureCategory)) {
      warnings.push(`Unknown failureCategory "${String(raw.failureCategory)}" — defaulting to "unknown"`);
    }

    const suggestedLocators = this.parseSuggestedLocators(raw.suggestedLocators, warnings);
    const suggestedAssertions = this.parseSuggestedAssertions(raw.suggestedAssertions, warnings);
    const patchSuggestions = this.parsePatchSuggestions(raw.patchSuggestions, warnings);

    const discoveredPages = this.buildDiscoveredPages(raw.discoveredPages, suggestedLocators);

    return {
      status,
      failureCategory,
      summary: typeof raw.summary === 'string' ? raw.summary : '',
      suggestedLocators,
      suggestedAssertions,
      patchSuggestions,
      warnings,
      screenshots: parseStringArray(raw.screenshots),
      recommendedLocators: [
        ...this.parseLegacyLocators(raw.recommendedLocators, warnings).map((entry) => ({
          selector: entry.selector,
          strategy: entry.legacyStrategy ?? entry.strategy,
          page: entry.pageObject,
          confidence: entry.confidenceScore,
          description: entry.reason,
        })),
        ...suggestedLocators.map((entry) => ({
          selector: entry.selector,
          strategy: entry.strategy,
          page: entry.pageObject,
          confidence: entry.confidenceScore,
          description: entry.reason,
        })),
      ],
      recommendedAssertions: [
        ...this.parseLegacyAssertions(raw.recommendedAssertions, warnings).map((entry) => ({
          description: entry.reason,
          selector: entry.assertion,
          assertionType: entry.assertionType ?? 'custom',
          page: entry.pageObject,
        })),
        ...suggestedAssertions.map((entry) => ({
          description: entry.reason,
          selector: entry.assertion,
          assertionType: 'custom',
          page: entry.pageObject,
        })),
      ],
      discoveredPages,
      repairSuggestions: [
        ...this.parseLegacyRepairSuggestions(raw.repairSuggestions, warnings),
        ...patchSuggestions.map((entry) => ({
          brokenSelector: entry.selector ?? '',
          suggestedSelector: entry.selector ?? '',
          strategy: entry.action,
          reason: entry.reason,
        })),
      ],
    };
  }

  private parseSuggestedLocators(raw: unknown, warnings: string[]): WebwrightLocatorSuggestion[] {
    if (!Array.isArray(raw)) return [];
    const results: WebwrightLocatorSuggestion[] = [];
    for (const item of raw) {
      if (typeof item !== 'object' || item === null) continue;
      const entry = item as Record<string, unknown>;
      const pageObject = typeof entry.pageObject === 'string' ? entry.pageObject.trim() : '';
      const selector = typeof entry.selector === 'string' ? entry.selector.trim() : '';
      const strategy = normalizeStrategy(entry.strategy);
      const confidenceScore = normalizeConfidence(entry.confidenceScore);
      const reason = typeof entry.reason === 'string' ? entry.reason : '';
      const fieldName = typeof entry.fieldName === 'string' && entry.fieldName.trim()
        ? entry.fieldName.trim()
        : deriveFieldName(pageObject, selector, typeof entry.target === 'string' ? entry.target : undefined);
      const target = typeof entry.target === 'string' ? entry.target : fieldName;

      if (!pageObject || !selector || !strategy || confidenceScore === null) {
        warnings.push('Invalid suggestedLocator entry skipped (missing pageObject, selector, strategy, or confidenceScore)');
        continue;
      }
      if (confidenceScore < 0.75) {
        warnings.push(`Low-confidence locator suggestion retained (${pageObject}.${fieldName})`);
      }

      results.push({
        pageObject,
        fieldName,
        target,
        selector,
        strategy,
        confidenceScore,
        reason,
      });
    }
    return results;
  }

  private parseLegacyLocators(raw: unknown, warnings: string[]): WebwrightLocatorSuggestion[] {
    if (!Array.isArray(raw)) return [];
    const results: WebwrightLocatorSuggestion[] = [];
    for (const item of raw) {
      if (typeof item !== 'object' || item === null) continue;
      const entry = item as Record<string, unknown>;
      const selector = typeof entry.selector === 'string' ? entry.selector.trim() : '';
      const pageObject = typeof entry.page === 'string' && entry.page.trim()
        ? entry.page.trim()
        : typeof entry.pageObject === 'string' && entry.pageObject.trim()
          ? entry.pageObject.trim()
          : '';
      const rawStrategy = typeof entry.strategy === 'string' ? entry.strategy.trim() : '';
      const strategy = normalizeStrategy(rawStrategy);
      const confidenceScore = normalizeConfidence(entry.confidence ?? entry.confidenceScore);
      if (!selector || !pageObject || !strategy || confidenceScore === null) {
        warnings.push('Legacy locator entry skipped (missing selector, page, strategy, or confidence)');
        continue;
      }
      if (confidenceScore < 0.75) {
        warnings.push(`Low-confidence locator suggestion retained (${pageObject})`);
      }
      results.push({
        pageObject,
        fieldName: typeof entry.fieldName === 'string' && entry.fieldName.trim()
          ? entry.fieldName.trim()
          : deriveFieldName(pageObject, selector, typeof entry.description === 'string' ? entry.description : undefined),
        target: typeof entry.description === 'string' ? entry.description : selector,
        selector,
        strategy,
        confidenceScore,
        reason: typeof entry.description === 'string' ? entry.description : '',
        legacyStrategy: rawStrategy,
      });
    }
    return results;
  }

  private parseSuggestedAssertions(raw: unknown, warnings: string[]): WebwrightAssertionSuggestion[] {
    if (!Array.isArray(raw)) return [];
    const results: WebwrightAssertionSuggestion[] = [];
    for (const item of raw) {
      if (typeof item !== 'object' || item === null) continue;
      const entry = item as Record<string, unknown>;
      const pageObject = typeof entry.pageObject === 'string' ? entry.pageObject.trim() : '';
      const methodName = typeof entry.methodName === 'string' ? entry.methodName.trim() : '';
      const assertion = typeof entry.assertion === 'string' ? entry.assertion.trim() : '';
      const reason = typeof entry.reason === 'string' ? entry.reason : '';
      if (!pageObject || !methodName || !assertion) {
        warnings.push('Invalid suggestedAssertion entry skipped (missing pageObject, methodName, or assertion)');
        continue;
      }
      results.push({ pageObject, methodName, assertion, reason });
    }
    return results;
  }

  private parseLegacyAssertions(raw: unknown, warnings: string[]): WebwrightAssertionSuggestion[] {
    if (!Array.isArray(raw)) return [];
    const results: WebwrightAssertionSuggestion[] = [];
    for (const item of raw) {
      if (typeof item !== 'object' || item === null) continue;
      const entry = item as Record<string, unknown>;
      const pageObject = typeof entry.page === 'string' ? entry.page.trim() : '';
      const selector = typeof entry.selector === 'string' ? entry.selector.trim() : '';
      const description = typeof entry.description === 'string' ? entry.description : '';
      const assertionType = typeof entry.assertionType === 'string' ? entry.assertionType : '';
      if (!pageObject || !selector || !assertionType) {
        warnings.push('Legacy assertion entry skipped (missing selector or assertionType)');
        continue;
      }
      const expectedValue = typeof entry.expectedValue === 'string' ? JSON.stringify(entry.expectedValue) : undefined;
      results.push({
        pageObject,
        methodName: deriveFieldName(pageObject, selector, description) || 'expectVisible',
        assertion: expectedValue
          ? `await expect(this.page.locator(${JSON.stringify(selector)})).${assertionType}(${expectedValue});`
          : `await expect(this.page.locator(${JSON.stringify(selector)})).${assertionType}();`,
        reason: description,
        assertionType,
      });
    }
    return results;
  }

  private parsePatchSuggestions(raw: unknown, warnings: string[]): WebwrightPatchSuggestion[] {
    if (!Array.isArray(raw)) return [];
    const results: WebwrightPatchSuggestion[] = [];
    for (const item of raw) {
      if (typeof item !== 'object' || item === null) continue;
      const entry = item as Record<string, unknown>;
      const pageObject = typeof entry.pageObject === 'string' ? entry.pageObject.trim() : '';
      const action = String(entry.action ?? '') as WebwrightPatchSuggestion['action'];
      const reason = typeof entry.reason === 'string' ? entry.reason : '';
      if (!pageObject || !['update-locator', 'add-assertion-method', 'replace-assertion', 'update-locator-json'].includes(action)) {
        warnings.push('Invalid patchSuggestion entry skipped');
        continue;
      }
      results.push({
        pageObject,
        action,
        filePath: typeof entry.filePath === 'string' ? entry.filePath : undefined,
        selector: typeof entry.selector === 'string' ? entry.selector : undefined,
        reason,
      });
    }
    return results;
  }

  private parseLegacyRepairSuggestions(raw: unknown, warnings: string[]): Array<{
    brokenSelector: string;
    suggestedSelector: string;
    strategy: string;
    reason: string;
  }> {
    if (!Array.isArray(raw)) return [];
    const results: Array<{
      brokenSelector: string;
      suggestedSelector: string;
      strategy: string;
      reason: string;
    }> = [];
    for (const item of raw) {
      if (typeof item !== 'object' || item === null) continue;
      const entry = item as Record<string, unknown>;
      const brokenSelector = typeof entry.brokenSelector === 'string' ? entry.brokenSelector.trim() : '';
      const suggestedSelector = typeof entry.suggestedSelector === 'string' ? entry.suggestedSelector.trim() : '';
      if (!brokenSelector || !suggestedSelector) {
        warnings.push('RepairSuggestion missing brokenSelector or suggestedSelector');
        continue;
      }
      results.push({
        brokenSelector,
        suggestedSelector,
        strategy: typeof entry.strategy === 'string' ? entry.strategy : 'update-locator',
        reason: typeof entry.reason === 'string' ? entry.reason : '',
      });
    }
    return results;
  }

  private buildDiscoveredPages(
    raw: unknown,
    locators: WebwrightLocatorSuggestion[],
  ): Array<{ pageName: string; pageClass: string; elements: string[] }> {
    const fromRaw = Array.isArray(raw)
      ? raw
          .map((item) => {
            if (typeof item !== 'object' || item === null) return null;
            const entry = item as Record<string, unknown>;
            const pageName = typeof entry.pageName === 'string' ? entry.pageName : '';
            const pageClass = typeof entry.pageClass === 'string' ? entry.pageClass : derivePageClass(pageName);
            const elements = Array.isArray(entry.elements)
              ? entry.elements.filter((value): value is string => typeof value === 'string')
              : [];
            return pageName ? { pageName, pageClass, elements } : null;
          })
          .filter((item): item is { pageName: string; pageClass: string; elements: string[] } => Boolean(item))
      : [];

    if (fromRaw.length > 0) return fromRaw;

    const pageObjects = new Map<string, string[]>();
    for (const locator of locators) {
      const elements = pageObjects.get(locator.pageObject) ?? [];
      elements.push(locator.fieldName);
      pageObjects.set(locator.pageObject, elements);
    }

    return Array.from(pageObjects.entries()).map(([pageObject, elements]) => ({
      pageName: pageObject,
      pageClass: derivePageClass(pageObject),
      elements,
    }));
  }
}
