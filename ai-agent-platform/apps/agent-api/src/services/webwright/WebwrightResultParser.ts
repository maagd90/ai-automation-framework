/**
 * Internal models produced by the Webwright result parser.
 * These are used inside our pipeline and are independent from the raw
 * Webwright sidecar output schema.
 */

export interface LocatorResult {
  selector: string;
  strategy: 'role' | 'label' | 'data-test' | 'css' | 'xpath' | 'text';
  page: string;
  /** Confidence score in the range [0, 1]. Values below 0.6 trigger a warning. */
  confidence: number;
  description?: string;
}

export interface AssertionPlan {
  description: string;
  selector: string;
  /** Type of assertion to apply. */
  assertionType: 'toBeVisible' | 'toHaveText' | 'toHaveURL' | 'toHaveCount' | 'toContainText';
  expectedValue?: string;
  page: string;
}

export interface PageOwnershipModel {
  pageName: string;
  /** Logical path under src/pages/ (e.g. "LoginPage", "ProductsPage"). */
  pageClass: string;
  elements: string[];
}

export interface RepairSuggestion {
  brokenSelector: string;
  suggestedSelector: string;
  strategy: string;
  reason: string;
}

export interface ParsedWebwrightResult {
  status: 'passed' | 'failed' | 'partial';
  summary: string;
  discoveredPages: PageOwnershipModel[];
  recommendedLocators: LocatorResult[];
  recommendedAssertions: AssertionPlan[];
  repairSuggestions: RepairSuggestion[];
  generatedExplorationScriptPath?: string;
  screenshots: string[];
  warnings: string[];
}

/** Raw shape expected from the sidecar process stdout / JSON file. */
interface RawWebwrightOutput {
  status?: unknown;
  summary?: unknown;
  discoveredPages?: unknown[];
  recommendedLocators?: unknown[];
  recommendedAssertions?: unknown[];
  repairSuggestions?: unknown[];
  generatedExplorationScriptPath?: unknown;
  screenshots?: unknown[];
  warnings?: unknown[];
}

const VALID_STATUSES = new Set(['passed', 'failed', 'partial']);
const VALID_ASSERTION_TYPES = new Set(['toBeVisible', 'toHaveText', 'toHaveURL', 'toHaveCount', 'toContainText']);
const VALID_LOCATOR_STRATEGIES = new Set(['role', 'label', 'data-test', 'css', 'xpath', 'text']);
const LOCATOR_CONFIDENCE_THRESHOLD = 0.6;

/**
 * Parses and validates the raw JSON output produced by the Webwright sidecar.
 *
 * This class is deliberately defensive: every field is validated before being
 * accepted into the internal model. Unknown or malformed data is silently
 * dropped and a warning is appended instead.
 */
export class WebwrightResultParser {
  /**
   * Parses a raw JSON string from the sidecar into a validated internal result.
   *
   * @param rawJson - The stdout/file content from the sidecar process.
   * @returns A fully validated ParsedWebwrightResult.
   * @throws {Error} if the JSON cannot be parsed or the root object is missing.
   */
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

    const warnings: string[] = this.parseStringArray(raw.warnings);

    const status = VALID_STATUSES.has(String(raw.status))
      ? (raw.status as ParsedWebwrightResult['status'])
      : 'failed';

    if (!VALID_STATUSES.has(String(raw.status))) {
      warnings.push(`Unknown status value "${String(raw.status)}" — defaulting to "failed"`);
    }

    const locators = this.parseLocators(raw.recommendedLocators, warnings);
    const assertions = this.parseAssertions(raw.recommendedAssertions, warnings);
    const pages = this.parsePages(raw.discoveredPages, warnings);
    const repairs = this.parseRepairs(raw.repairSuggestions, warnings);

    return {
      status,
      summary: typeof raw.summary === 'string' ? raw.summary : '',
      discoveredPages: pages,
      recommendedLocators: locators,
      recommendedAssertions: assertions,
      repairSuggestions: repairs,
      generatedExplorationScriptPath:
        typeof raw.generatedExplorationScriptPath === 'string'
          ? raw.generatedExplorationScriptPath
          : undefined,
      screenshots: this.parseStringArray(raw.screenshots),
      warnings,
    };
  }

  private parseLocators(raw: unknown, warnings: string[]): LocatorResult[] {
    if (!Array.isArray(raw)) return [];
    const results: LocatorResult[] = [];
    for (const item of raw) {
      if (typeof item !== 'object' || item === null) continue;
      const entry = item as Record<string, unknown>;
      const selector = typeof entry['selector'] === 'string' ? entry['selector'] : '';
      const strategy = VALID_LOCATOR_STRATEGIES.has(String(entry['strategy']))
        ? (entry['strategy'] as LocatorResult['strategy'])
        : 'css';
      const page = typeof entry['page'] === 'string' ? entry['page'] : 'UnknownPage';
      const confidence = typeof entry['confidence'] === 'number' ? entry['confidence'] : 0;

      if (!selector) {
        warnings.push('Locator entry missing selector — skipped');
        continue;
      }
      if (confidence < LOCATOR_CONFIDENCE_THRESHOLD) {
        warnings.push(`Low-confidence locator "${selector}" (${confidence.toFixed(2)}) — verify before use`);
      }
      results.push({
        selector,
        strategy,
        page,
        confidence,
        description: typeof entry['description'] === 'string' ? entry['description'] : undefined,
      });
    }
    return results;
  }

  private parseAssertions(raw: unknown, warnings: string[]): AssertionPlan[] {
    if (!Array.isArray(raw)) return [];
    const results: AssertionPlan[] = [];
    for (const item of raw) {
      if (typeof item !== 'object' || item === null) continue;
      const entry = item as Record<string, unknown>;
      const description = typeof entry['description'] === 'string' ? entry['description'] : '';
      const selector = typeof entry['selector'] === 'string' ? entry['selector'] : '';
      const assertionType = VALID_ASSERTION_TYPES.has(String(entry['assertionType']))
        ? (entry['assertionType'] as AssertionPlan['assertionType'])
        : null;
      const page = typeof entry['page'] === 'string' ? entry['page'] : 'UnknownPage';

      if (!selector || !assertionType) {
        warnings.push(`Assertion entry missing selector or assertionType — skipped (description: "${description}")`);
        continue;
      }
      results.push({
        description,
        selector,
        assertionType,
        expectedValue: typeof entry['expectedValue'] === 'string' ? entry['expectedValue'] : undefined,
        page,
      });
    }
    return results;
  }

  private parsePages(raw: unknown, warnings: string[]): PageOwnershipModel[] {
    if (!Array.isArray(raw)) return [];
    const results: PageOwnershipModel[] = [];
    for (const item of raw) {
      if (typeof item !== 'object' || item === null) continue;
      const entry = item as Record<string, unknown>;
      const pageName = typeof entry['pageName'] === 'string' ? entry['pageName'] : '';
      const pageClass = typeof entry['pageClass'] === 'string' ? entry['pageClass'] : pageName;
      const elements = Array.isArray(entry['elements'])
        ? entry['elements'].filter((e): e is string => typeof e === 'string')
        : [];
      if (!pageName) {
        warnings.push('DiscoveredPage entry missing pageName — skipped');
        continue;
      }
      results.push({ pageName, pageClass, elements });
    }
    return results;
  }

  private parseRepairs(raw: unknown, warnings: string[]): RepairSuggestion[] {
    if (!Array.isArray(raw)) return [];
    const results: RepairSuggestion[] = [];
    for (const item of raw) {
      if (typeof item !== 'object' || item === null) continue;
      const entry = item as Record<string, unknown>;
      const brokenSelector = typeof entry['brokenSelector'] === 'string' ? entry['brokenSelector'] : '';
      const suggestedSelector = typeof entry['suggestedSelector'] === 'string' ? entry['suggestedSelector'] : '';
      if (!brokenSelector || !suggestedSelector) {
        warnings.push('RepairSuggestion missing brokenSelector or suggestedSelector — skipped');
        continue;
      }
      results.push({
        brokenSelector,
        suggestedSelector,
        strategy: typeof entry['strategy'] === 'string' ? entry['strategy'] : 'css',
        reason: typeof entry['reason'] === 'string' ? entry['reason'] : '',
      });
    }
    return results;
  }

  private parseStringArray(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((e): e is string => typeof e === 'string');
  }
}
