import { describe, expect, it } from 'vitest';
import {
  extractTestBlocks,
  mergeLocatorEntries,
  reconcileSpecDataReferences,
} from '../../ai-agent-platform/apps/agent-api/src/services/batch/ReviewMergeService';
import type { LocatorEntry } from '../../ai-agent-platform/apps/agent-api/src/services/batch/ReviewMergeService';

// ---------------------------------------------------------------------------
// extractTestBlocks unit tests
// ---------------------------------------------------------------------------
// These tests verify that the brace-depth tracker correctly identifies the
// arrow function body opening brace (the one after `=>`) rather than the
// parameter destructuring brace `{ page }`, which caused premature depth
// exit and truncated test blocks in the original implementation.
// ---------------------------------------------------------------------------

describe('extractTestBlocks', () => {
  it('extracts a single test block completely', () => {
    const source = `
import { test, expect } from '@playwright/test';

test("Login with valid credentials", async ({ page }) => {
  await page.goto('/login');
  await page.fill('#username', 'user');
  await page.fill('#password', 'pass');
  await page.click('button[type="submit"]');
  await expect(page.locator('[data-test="inventory-container"]')).toBeVisible();
});
`;
    const blocks = extractTestBlocks(source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].title).toBe('"Login with valid credentials"');
    // The body must include the complete function body and not be truncated
    expect(blocks[0].body).toContain('await page.goto');
    expect(blocks[0].body).toContain('await page.fill');
    expect(blocks[0].body).toContain('await page.click');
    expect(blocks[0].body).toContain('toBeVisible');
    // Must be a complete, syntactically valid test() call
    expect(blocks[0].body.startsWith('test(')).toBe(true);
    expect(blocks[0].body).toMatch(/\}\s*\)\s*;?\s*$/);
  });

  it('extracts multiple test blocks correctly — each block is complete and independent', () => {
    const source = `
import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';

test("Login with valid credentials", async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login('standard_user', 'secret_sauce');
  await expect(page).toHaveURL('/inventory.html');
});

test("Login with invalid password", async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login('standard_user', 'wrong_password');
  await expect(page.locator('[data-test="error-button"]')).toBeVisible();
});

test("Login with empty credentials shows error", async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login('', '');
  await expect(page.locator('[data-test="error-button"]')).toBeVisible();
});
`;
    const blocks = extractTestBlocks(source);
    expect(blocks).toHaveLength(3);

    // First block
    expect(blocks[0].title).toBe('"Login with valid credentials"');
    expect(blocks[0].body).toContain('standard_user');
    expect(blocks[0].body).toContain('secret_sauce');
    expect(blocks[0].body).toContain('/inventory.html');
    // Must NOT contain content from the second test
    expect(blocks[0].body).not.toContain('wrong_password');

    // Second block
    expect(blocks[1].title).toBe('"Login with invalid password"');
    expect(blocks[1].body).toContain('wrong_password');
    expect(blocks[1].body).not.toContain('/inventory.html');

    // Third block
    expect(blocks[2].title).toBe('"Login with empty credentials shows error"');
    expect(blocks[2].body).toContain("login('', '')");
  });

  it('handles test blocks with nested async callbacks (e.g. page.on)', () => {
    const source = `
test("Dialog handling", async ({ page }) => {
  await page.goto('/');
  page.on('dialog', async (dialog) => {
    await dialog.dismiss();
  });
  await page.click('#open-dialog');
  await expect(page.locator('#result')).toHaveText('dismissed');
});
`;
    const blocks = extractTestBlocks(source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].body).toContain('dialog.dismiss');
    expect(blocks[0].body).toContain('#open-dialog');
    expect(blocks[0].body).toContain('dismissed');
    // Whole body should be well-formed
    expect(blocks[0].body.startsWith('test(')).toBe(true);
  });

  it('handles test bodies that contain many ); occurrences without truncation', () => {
    const source = `
test("Complex interactions", async ({ page }) => {
  const homePage = new HomePage(page);
  await homePage.goto();
  await page.click('button.submit');
  await page.waitForSelector('#result', { timeout: 5000 });
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('.message')).toHaveText('Done');
});
`;
    const blocks = extractTestBlocks(source);
    expect(blocks).toHaveLength(1);
    // All lines must be present — not truncated at first );
    expect(blocks[0].body).toContain('homePage.goto()');
    expect(blocks[0].body).toContain('button.submit');
    expect(blocks[0].body).toContain('{ timeout: 5000 }');
    expect(blocks[0].body).toContain('#result');
    expect(blocks[0].body).toContain("'Done'");
  });

  it('returns an empty array for source with no test blocks', () => {
    const source = `
import { expect } from '@playwright/test';
const x = 1;
`;
    expect(extractTestBlocks(source)).toHaveLength(0);
  });

  it('deduplicates correctly when titles differ only in quotes', () => {
    // Two tests with different content but structurally valid
    const source = `
test('Single quote title', async ({ page }) => {
  await page.goto('/');
});

test("Double quote title", async ({ page }) => {
  await page.goto('/about');
});
`;
    const blocks = extractTestBlocks(source);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].title).toBe("'Single quote title'");
    expect(blocks[1].title).toBe('"Double quote title"');
  });
});

// ---------------------------------------------------------------------------
// mergeLocatorEntries unit tests
// ---------------------------------------------------------------------------
// These tests verify the deduplication logic for locator JSON entries:
//  - Unique entries are all preserved
//  - Duplicates are resolved by confidence score, then strategy priority
// ---------------------------------------------------------------------------

describe('mergeLocatorEntries', () => {
  it('returns all entries when there are no duplicates', () => {
    const entries: LocatorEntry[] = [
      { name: 'usernameInput', selector: "page.getByPlaceholder('Username')", strategy: 'getByPlaceholder', confidenceScore: 0.9 },
      { name: 'passwordInput', selector: "page.getByPlaceholder('Password')", strategy: 'getByPlaceholder', confidenceScore: 0.88 },
      { name: 'loginButton', selector: "page.getByRole('button', { name: 'Login' })", strategy: 'getByRole', confidenceScore: 0.95 },
    ];
    const result = mergeLocatorEntries(entries);
    expect(result).toHaveLength(3);
    const names = result.map((e) => e.name);
    expect(names).toContain('usernameInput');
    expect(names).toContain('passwordInput');
    expect(names).toContain('loginButton');
  });

  it('keeps the entry with higher confidence score when names match', () => {
    const entries: LocatorEntry[] = [
      { name: 'usernameInput', selector: "page.locator('#username')", strategy: 'locator', confidenceScore: 0.6 },
      { name: 'usernameInput', selector: "page.getByPlaceholder('Username')", strategy: 'getByPlaceholder', confidenceScore: 0.91 },
    ];
    const result = mergeLocatorEntries(entries);
    expect(result).toHaveLength(1);
    expect(result[0].confidenceScore).toBe(0.91);
    expect(result[0].strategy).toBe('getByPlaceholder');
  });

  it('prefers higher-priority strategy when confidence scores are equal', () => {
    const entries: LocatorEntry[] = [
      { name: 'submitBtn', selector: "page.getByText('Submit')", strategy: 'getByText', confidenceScore: 0.8 },
      { name: 'submitBtn', selector: "page.getByRole('button', { name: 'Submit' })", strategy: 'getByRole', confidenceScore: 0.8 },
    ];
    const result = mergeLocatorEntries(entries);
    expect(result).toHaveLength(1);
    expect(result[0].strategy).toBe('getByRole');
  });

  it('prefers data-testid over getByRole when confidence is tied', () => {
    const entries: LocatorEntry[] = [
      { name: 'cartIcon', selector: "page.getByRole('link', { name: 'Cart' })", strategy: 'getByRole', confidenceScore: 0.85 },
      { name: 'cartIcon', selector: "page.getByTestId('shopping-cart')", strategy: 'data-testid', confidenceScore: 0.85 },
    ];
    const result = mergeLocatorEntries(entries);
    expect(result).toHaveLength(1);
    expect(result[0].strategy).toBe('data-testid');
  });

  it('keeps first-seen entry when both confidence and strategy are tied', () => {
    const entries: LocatorEntry[] = [
      { name: 'menuItem', selector: "page.getByRole('menuitem', { name: 'Products' })", strategy: 'getByRole', confidenceScore: 0.75 },
      { name: 'menuItem', selector: "page.getByRole('menuitem', { name: 'All Items' })", strategy: 'getByRole', confidenceScore: 0.75 },
    ];
    const result = mergeLocatorEntries(entries);
    expect(result).toHaveLength(1);
    expect(result[0].selector).toContain('Products');
  });

  it('deduplicates correctly across 10 SauceDemo-like locators from multiple children', () => {
    const child1: LocatorEntry[] = [
      { name: 'usernameInput', selector: "page.getByPlaceholder('Username')", strategy: 'getByPlaceholder', confidenceScore: 0.91 },
      { name: 'passwordInput', selector: "page.getByPlaceholder('Password')", strategy: 'getByPlaceholder', confidenceScore: 0.91 },
      { name: 'loginButton', selector: "page.locator('[data-test=\"login-button\"]')", strategy: 'locator', confidenceScore: 0.7 },
      { name: 'errorMessage', selector: "page.locator('[data-test=\"error-button\"]')", strategy: 'locator', confidenceScore: 0.72 },
      { name: 'inventoryList', selector: "page.locator('[data-test=\"inventory-container\"]')", strategy: 'locator', confidenceScore: 0.8 },
    ];
    const child2: LocatorEntry[] = [
      { name: 'usernameInput', selector: "page.getByTestId('user-name')", strategy: 'data-testid', confidenceScore: 0.91 },
      { name: 'loginButton', selector: "page.getByTestId('login-button')", strategy: 'data-testid', confidenceScore: 0.95 },
      { name: 'productTitle', selector: "page.getByRole('heading', { level: 3 })", strategy: 'getByRole', confidenceScore: 0.85 },
      { name: 'addToCartBtn', selector: "page.getByRole('button', { name: /add to cart/i })", strategy: 'getByRole', confidenceScore: 0.9 },
      { name: 'cartBadge', selector: "page.getByTestId('shopping-cart-badge')", strategy: 'data-testid', confidenceScore: 0.93 },
    ];

    const result = mergeLocatorEntries([...child1, ...child2]);
    // 8 unique names: usernameInput, passwordInput, loginButton, errorMessage,
    // inventoryList, productTitle, addToCartBtn, cartBadge
    expect(result).toHaveLength(8);

    const byName = Object.fromEntries(result.map((e) => [e.name, e]));

    // child2 data-testid wins over child1 getByPlaceholder (same confidence)
    expect(byName['usernameInput'].strategy).toBe('data-testid');

    // child2 getByTestId wins for loginButton (higher confidence 0.95 > 0.7)
    expect(byName['loginButton'].strategy).toBe('data-testid');
    expect(byName['loginButton'].confidenceScore).toBe(0.95);
  });

  it('returns empty array for empty input', () => {
    expect(mergeLocatorEntries([])).toHaveLength(0);
  });

  it('falls back to target field for deduplication when name is missing', () => {
    const entries: LocatorEntry[] = [
      { name: '', target: 'Username field', selector: "page.locator('#user')", strategy: 'locator', confidenceScore: 0.5 },
      { name: '', target: 'Username field', selector: "page.getByPlaceholder('Username')", strategy: 'getByPlaceholder', confidenceScore: 0.9 },
    ];
    const result = mergeLocatorEntries(entries);
    expect(result).toHaveLength(1);
    expect(result[0].confidenceScore).toBe(0.9);
  });
});

// ---------------------------------------------------------------------------
// reconcileSpecDataReferences unit tests
// ---------------------------------------------------------------------------
// These tests verify that the data reconciliation step adds any missing JSON
// property paths that the merged spec file references via dot-notation so
// that `tsc --noEmit` does not raise TS2339 errors.
// ---------------------------------------------------------------------------

describe('reconcileSpecDataReferences', () => {
  it('adds missing top-level key with empty string placeholder', () => {
    const spec = `
import homeData from '../test-data/home.data.json';

test('check title', async ({ page }) => {
  await page.goto(homeData.url);
});
`;
    const result = reconcileSpecDataReferences(spec, 'homeData', {});
    expect(result).toHaveProperty('url', '');
  });

  it('adds missing nested key when parent object exists', () => {
    const spec = `homeData.validUser.username`;
    const data = { validUser: { password: 'secret_sauce' } };
    const result = reconcileSpecDataReferences(spec, 'homeData', data);
    expect((result['validUser'] as Record<string, unknown>)['username']).toBe('');
    // Existing key must be preserved
    expect((result['validUser'] as Record<string, unknown>)['password']).toBe('secret_sauce');
  });

  it('creates nested object when parent key is completely missing', () => {
    const spec = `homeData.invalidUser.password`;
    const result = reconcileSpecDataReferences(spec, 'homeData', {});
    expect(result).toHaveProperty('invalidUser');
    expect((result['invalidUser'] as Record<string, unknown>)['password']).toBe('');
  });

  it('does not overwrite existing values', () => {
    const spec = `homeData.validUser.username homeData.validUser.password`;
    const data = { validUser: { username: 'standard_user', password: 'secret_sauce' } };
    const result = reconcileSpecDataReferences(spec, 'homeData', data);
    expect((result['validUser'] as Record<string, unknown>)['username']).toBe('standard_user');
    expect((result['validUser'] as Record<string, unknown>)['password']).toBe('secret_sauce');
  });

  it('handles multiple missing keys from SauceDemo-like spec', () => {
    const spec = `
import homeData from '../test-data/home.data.json';

test('valid login', async ({ page }) => {
  await loginPage.enterUsername(homeData.validUser.username);
  await loginPage.enterPassword(homeData.validUser.password);
});

test('invalid login', async ({ page }) => {
  await loginPage.enterUsername(homeData.invalidUser.username);
  await loginPage.enterPassword(homeData.invalidUser.password);
});
`;
    // Simulate partial data: validUser has username but not password; invalidUser is missing entirely
    const data: Record<string, unknown> = { validUser: { username: 'standard_user' } };
    const result = reconcileSpecDataReferences(spec, 'homeData', data);

    const validUser = result['validUser'] as Record<string, unknown>;
    expect(validUser['username']).toBe('standard_user');
    expect(validUser['password']).toBe('');

    const invalidUser = result['invalidUser'] as Record<string, unknown>;
    expect(invalidUser['username']).toBe('');
    expect(invalidUser['password']).toBe('');
  });

  it('returns data unchanged when spec references match existing structure', () => {
    const spec = `loginData.validUser.username loginData.validUser.password`;
    const data = { validUser: { username: 'standard_user', password: 'secret_sauce' } };
    const result = reconcileSpecDataReferences(spec, 'loginData', data);
    expect(result).toEqual(data);
  });

  it('does not touch unrelated data variable references', () => {
    const spec = `otherData.someKey.nested homeData.title`;
    const data: Record<string, unknown> = {};
    const result = reconcileSpecDataReferences(spec, 'homeData', data);
    // Only homeData references are processed
    expect(result).toHaveProperty('title', '');
    expect(result).not.toHaveProperty('someKey');
  });
});
