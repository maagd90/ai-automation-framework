# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: saucedemo.spec.ts >> TC_SD_009 – Open product details
- Location: generated/tests/saucedemo.spec.ts:100:1

# Error details

```
Error: page.goto: net::ERR_NAME_NOT_RESOLVED at https://www.saucedemo.com/
Call log:
  - navigating to "https://www.saucedemo.com/", waiting until "load"

```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | const URL = 'https://www.saucedemo.com/';
  4   | const USER = 'standard_user';
  5   | const PASS = 'secret_sauce';
  6   | 
  7   | // ── helpers ──────────────────────────────────────────────────────────────────
  8   | 
  9   | async function login(page: import('@playwright/test').Page): Promise<void> {
> 10  |   await page.goto(URL);
      |              ^ Error: page.goto: net::ERR_NAME_NOT_RESOLVED at https://www.saucedemo.com/
  11  |   await page.fill('#user-name', USER);
  12  |   await page.fill('#password', PASS);
  13  |   await page.click('#login-button');
  14  |   await expect(page.locator('.title')).toHaveText('Products');
  15  | }
  16  | 
  17  | async function addBackpackToCart(page: import('@playwright/test').Page): Promise<void> {
  18  |   await page.click('[data-test="add-to-cart-sauce-labs-backpack"]');
  19  | }
  20  | 
  21  | // ── TC_SD_001 ─────────────────────────────────────────────────────────────────
  22  | test('TC_SD_001 – Login with valid credentials', async ({ page }) => {
  23  |   await page.goto(URL);
  24  |   await page.fill('#user-name', USER);
  25  |   await page.fill('#password', PASS);
  26  |   await page.click('#login-button');
  27  |   await expect(page.locator('.title')).toHaveText('Products');
  28  | });
  29  | 
  30  | // ── TC_SD_002 ─────────────────────────────────────────────────────────────────
  31  | test('TC_SD_002 – Login with invalid password', async ({ page }) => {
  32  |   await page.goto(URL);
  33  |   await page.fill('#user-name', USER);
  34  |   await page.fill('#password', 'wrong_password');
  35  |   await page.click('#login-button');
  36  |   await expect(page.locator('[data-test="error"]')).toBeVisible();
  37  | });
  38  | 
  39  | // ── TC_SD_003 ─────────────────────────────────────────────────────────────────
  40  | test('TC_SD_003 – Add backpack to cart', async ({ page }) => {
  41  |   await login(page);
  42  |   await addBackpackToCart(page);
  43  |   await expect(page.locator('.shopping_cart_badge')).toHaveText('1');
  44  | });
  45  | 
  46  | // ── TC_SD_004 ─────────────────────────────────────────────────────────────────
  47  | test('TC_SD_004 – Open cart after adding item', async ({ page }) => {
  48  |   await login(page);
  49  |   await addBackpackToCart(page);
  50  |   await page.click('.shopping_cart_link');
  51  |   await expect(page.locator('.title')).toHaveText('Your Cart');
  52  | });
  53  | 
  54  | // ── TC_SD_005 ─────────────────────────────────────────────────────────────────
  55  | test('TC_SD_005 – Remove item from cart', async ({ page }) => {
  56  |   await login(page);
  57  |   await addBackpackToCart(page);
  58  |   await page.click('.shopping_cart_link');
  59  |   await page.click('[data-test="remove-sauce-labs-backpack"]');
  60  |   await expect(page.locator('.cart_item')).toHaveCount(0);
  61  | });
  62  | 
  63  | // ── TC_SD_006 ─────────────────────────────────────────────────────────────────
  64  | test('TC_SD_006 – Start checkout from cart', async ({ page }) => {
  65  |   await login(page);
  66  |   await addBackpackToCart(page);
  67  |   await page.click('.shopping_cart_link');
  68  |   await page.click('[data-test="checkout"]');
  69  |   await expect(page.locator('.title')).toHaveText('Checkout: Your Information');
  70  | });
  71  | 
  72  | // ── TC_SD_007 ─────────────────────────────────────────────────────────────────
  73  | test('TC_SD_007 – Complete checkout information', async ({ page }) => {
  74  |   await login(page);
  75  |   await addBackpackToCart(page);
  76  |   await page.click('.shopping_cart_link');
  77  |   await page.click('[data-test="checkout"]');
  78  |   await page.fill('#first-name', 'Demo');
  79  |   await page.fill('#last-name', 'User');
  80  |   await page.fill('#postal-code', '12345');
  81  |   await page.click('[data-test="continue"]');
  82  |   await expect(page.locator('.title')).toHaveText('Checkout: Overview');
  83  | });
  84  | 
  85  | // ── TC_SD_008 ─────────────────────────────────────────────────────────────────
  86  | test('TC_SD_008 – Finish checkout order', async ({ page }) => {
  87  |   await login(page);
  88  |   await addBackpackToCart(page);
  89  |   await page.click('.shopping_cart_link');
  90  |   await page.click('[data-test="checkout"]');
  91  |   await page.fill('#first-name', 'Demo');
  92  |   await page.fill('#last-name', 'User');
  93  |   await page.fill('#postal-code', '12345');
  94  |   await page.click('[data-test="continue"]');
  95  |   await page.click('[data-test="finish"]');
  96  |   await expect(page.locator('.complete-header')).toHaveText('Thank you for your order!');
  97  | });
  98  | 
  99  | // ── TC_SD_009 ─────────────────────────────────────────────────────────────────
  100 | test('TC_SD_009 – Open product details', async ({ page }) => {
  101 |   await login(page);
  102 |   await page.click('.inventory_item_name >> text=Sauce Labs Backpack');
  103 |   await expect(page.locator('.inventory_details_name')).toHaveText('Sauce Labs Backpack');
  104 | });
  105 | 
  106 | // ── TC_SD_010 ─────────────────────────────────────────────────────────────────
  107 | test('TC_SD_010 – Logout from application', async ({ page }) => {
  108 |   await login(page);
  109 |   await page.click('#react-burger-menu-btn');
  110 |   await page.click('#logout_sidebar_link');
```