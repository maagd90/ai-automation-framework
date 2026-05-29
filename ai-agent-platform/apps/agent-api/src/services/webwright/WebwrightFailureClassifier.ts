export type WebwrightFailureCategory =
  | 'locator'
  | 'assertion'
  | 'navigation'
  | 'page-state'
  | 'unknown';

const CATEGORY_PATTERNS: Array<{ category: WebwrightFailureCategory; patterns: RegExp[] }> = [
  {
    category: 'locator',
    patterns: [
      /locator.*timeout/i,
      /element.*not found/i,
      /strict mode violation/i,
      /waiting for selector/i,
      /could not locate/i,
    ],
  },
  {
    category: 'assertion',
    patterns: [
      /expect\(.*to/i,
      /assertion failed/i,
      /toHaveText/i,
      /toBeVisible/i,
      /toHaveURL/i,
    ],
  },
  {
    category: 'navigation',
    patterns: [
      /navigation timeout/i,
      /page.goto/i,
      /net::err/i,
      /navigation.*failed/i,
    ],
  },
  {
    category: 'page-state',
    patterns: [
      /page state/i,
      /unexpected page/i,
      /post-?login/i,
      /inventory page/i,
      /dashboard page/i,
    ],
  },
];

export class WebwrightFailureClassifier {
  classify(text: string): WebwrightFailureCategory {
    const normalized = text || '';
    for (const group of CATEGORY_PATTERNS) {
      if (group.patterns.some((pattern) => pattern.test(normalized))) {
        return group.category;
      }
    }
    return 'unknown';
  }

  shouldRepair(category: WebwrightFailureCategory): boolean {
    return category === 'locator'
      || category === 'assertion'
      || category === 'navigation'
      || category === 'page-state';
  }
}
