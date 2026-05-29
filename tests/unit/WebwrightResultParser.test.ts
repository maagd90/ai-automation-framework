import { describe, it, expect } from 'vitest';
import { WebwrightResultParser } from '../../ai-agent-platform/apps/agent-api/src/services/webwright/WebwrightResultParser';

describe('WebwrightResultParser', () => {
  const parser = new WebwrightResultParser();

  const validOutput = JSON.stringify({
    status: 'passed',
    summary: 'Explored example.com — found 3 locator candidates',
    discoveredPages: [
      { pageName: 'Login Page', pageClass: 'LoginPage', elements: ['username', 'password', 'login-button'] },
    ],
    recommendedLocators: [
      { selector: "getByRole('textbox', {name: 'Username'})", strategy: 'role', page: 'LoginPage', confidence: 0.9 },
      { selector: "getByRole('button', {name: 'Login'})", strategy: 'role', page: 'LoginPage', confidence: 0.85 },
      { selector: "[data-test='error']", strategy: 'data-test', page: 'LoginPage', confidence: 0.8 },
    ],
    recommendedAssertions: [
      { description: 'Error visible on invalid login', selector: "[data-test='error']", assertionType: 'toBeVisible', page: 'LoginPage', expectedValue: 'Error' },
      { description: 'Products heading visible after login', selector: "[role='heading']", assertionType: 'toBeVisible', page: 'ProductsPage' },
    ],
    repairSuggestions: [],
    screenshots: ['/tmp/jobs/webwright/job1/screenshot.png'],
    warnings: [],
  });

  it('parses valid sidecar output successfully', () => {
    const result = parser.parse(validOutput);
    expect(result.status).toBe('passed');
    expect(result.summary).toContain('3 locator candidate');
  });

  it('returns discovered pages', () => {
    const result = parser.parse(validOutput);
    expect(result.discoveredPages).toHaveLength(1);
    expect(result.discoveredPages[0].pageName).toBe('Login Page');
    expect(result.discoveredPages[0].pageClass).toBe('LoginPage');
  });

  it('returns recommended locators with all fields', () => {
    const result = parser.parse(validOutput);
    expect(result.recommendedLocators).toHaveLength(3);
    const first = result.recommendedLocators[0];
    expect(first.selector).toContain('Username');
    expect(first.strategy).toBe('role');
    expect(first.confidence).toBe(0.9);
    expect(first.page).toBe('LoginPage');
  });

  it('returns recommended assertions', () => {
    const result = parser.parse(validOutput);
    expect(result.recommendedAssertions).toHaveLength(2);
    expect(result.recommendedAssertions[0].assertionType).toBe('toBeVisible');
    expect(result.recommendedAssertions[0].expectedValue).toBe('Error');
  });

  it('returns screenshots array', () => {
    const result = parser.parse(validOutput);
    expect(result.screenshots).toHaveLength(1);
  });

  it('throws on invalid JSON', () => {
    expect(() => parser.parse('not-json')).toThrow('invalid JSON');
  });

  it('throws on JSON array root', () => {
    expect(() => parser.parse('[]')).toThrow('must be a JSON object');
  });

  it('throws on JSON null root', () => {
    expect(() => parser.parse('null')).toThrow('must be a JSON object');
  });

  it('defaults status to "failed" on unknown status value', () => {
    const raw = JSON.stringify({ status: 'unknown', summary: '', discoveredPages: [], recommendedLocators: [], recommendedAssertions: [], repairSuggestions: [], screenshots: [], warnings: [] });
    const result = parser.parse(raw);
    expect(result.status).toBe('failed');
    expect(result.warnings.some((w) => w.includes('Unknown status'))).toBe(true);
  });

  it('skips locator entries missing selector and adds warning', () => {
    const raw = JSON.stringify({
      status: 'passed', summary: '', discoveredPages: [], repairSuggestions: [], screenshots: [], warnings: [],
      recommendedLocators: [{ strategy: 'role', page: 'LoginPage', confidence: 0.9 }],
      recommendedAssertions: [],
    });
    const result = parser.parse(raw);
    expect(result.recommendedLocators).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes('missing selector'))).toBe(true);
  });

  it('adds warning for low-confidence locators but still includes them', () => {
    const raw = JSON.stringify({
      status: 'passed', summary: '', discoveredPages: [], repairSuggestions: [], screenshots: [], warnings: [],
      recommendedLocators: [{ selector: '.low-conf', strategy: 'css', page: 'LoginPage', confidence: 0.3 }],
      recommendedAssertions: [],
    });
    const result = parser.parse(raw);
    expect(result.recommendedLocators).toHaveLength(1);
    expect(result.warnings.some((w) => w.includes('Low-confidence'))).toBe(true);
  });

  it('skips assertion entries missing required fields', () => {
    const raw = JSON.stringify({
      status: 'passed', summary: '', discoveredPages: [], repairSuggestions: [], screenshots: [], warnings: [],
      recommendedLocators: [],
      recommendedAssertions: [{ description: 'missing selector', assertionType: 'toBeVisible', page: 'LoginPage' }],
    });
    const result = parser.parse(raw);
    expect(result.recommendedAssertions).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes('missing selector or assertionType'))).toBe(true);
  });

  it('parses repair suggestions correctly', () => {
    const raw = JSON.stringify({
      status: 'partial', summary: '', discoveredPages: [], screenshots: [], warnings: [],
      recommendedLocators: [], recommendedAssertions: [],
      repairSuggestions: [
        { brokenSelector: '.old-btn', suggestedSelector: "[role='button']", strategy: 'role', reason: 'Old selector no longer exists' },
      ],
    });
    const result = parser.parse(raw);
    expect(result.repairSuggestions).toHaveLength(1);
    expect(result.repairSuggestions[0].brokenSelector).toBe('.old-btn');
    expect(result.repairSuggestions[0].suggestedSelector).toBe("[role='button']");
  });

  it('skips repair suggestions missing required fields', () => {
    const raw = JSON.stringify({
      status: 'passed', summary: '', discoveredPages: [], screenshots: [], warnings: [],
      recommendedLocators: [], recommendedAssertions: [],
      repairSuggestions: [{ brokenSelector: '.only-broken' }],
    });
    const result = parser.parse(raw);
    expect(result.repairSuggestions).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes('RepairSuggestion missing'))).toBe(true);
  });

  it('handles missing optional arrays gracefully', () => {
    const raw = JSON.stringify({ status: 'passed', summary: 'ok' });
    const result = parser.parse(raw);
    expect(result.recommendedLocators).toEqual([]);
    expect(result.recommendedAssertions).toEqual([]);
    expect(result.discoveredPages).toEqual([]);
    expect(result.repairSuggestions).toEqual([]);
    expect(result.screenshots).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});
