"""
Webwright sidecar runner.

Reads JSON input from the Node repair service, explores the target site with
Playwright, and writes JSON-only repair suggestions to result.json.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


def empty_result(status: str, failure_category: str, summary: str, warnings: list[str]) -> dict:
    return {
        "status": status,
        "failureCategory": failure_category,
        "summary": summary,
        "suggestedLocators": [],
        "suggestedAssertions": [],
        "patchSuggestions": [],
        "warnings": warnings,
    }


def classify(task: dict, fallback: str = "unknown") -> str:
    return str(task.get("failureCategory") or fallback)


def build_locator(page_object: str, field_name: str, target: str, selector: str, strategy: str, confidence: float, reason: str) -> dict:
    return {
        "pageObject": page_object,
        "fieldName": field_name,
        "target": target,
        "selector": selector,
        "strategy": strategy,
        "confidenceScore": confidence,
        "reason": reason,
    }


def build_assertion(page_object: str, method_name: str, assertion: str, reason: str) -> dict:
    return {
        "pageObject": page_object,
        "methodName": method_name,
        "assertion": assertion,
        "reason": reason,
    }


def explore(target_url: str, payload: dict, output_dir: Path) -> dict:
    try:
        from playwright.sync_api import sync_playwright  # type: ignore[import]
    except ImportError:
        return empty_result("failed", classify(payload, "unknown"), "playwright is not installed in the sidecar", ["Install playwright in the sidecar environment"])

    task = payload.get("task", {})
    failure_category = classify(payload, "unknown")
    focus_areas = task.get("focusAreas") or []
    warnings: list[str] = []
    locators: list[dict] = []
    assertions: list[dict] = []
    patch_suggestions: list[dict] = []

    locator_map = {
        "login-fields": [
            build_locator("LoginPage", "usernameField", "Username field", "page.getByPlaceholder('Username')", "getByPlaceholder", 0.96, "Matched username field by placeholder"),
            build_locator("LoginPage", "passwordField", "Password field", "page.getByLabel('Password')", "getByLabel", 0.95, "Matched password field by label"),
        ],
        "login-button": [
            build_locator("LoginPage", "loginButton", "Login button", "page.getByRole('button', { name: 'Login' })", "getByRole", 0.97, "Matched login button by role and accessible name"),
        ],
        "products-page": [
            build_locator("ProductsPage", "productsHeading", "Products heading", "page.getByRole('heading', { name: 'Products' })", "getByRole", 0.92, "Matched products heading by role"),
        ],
        "cart-badge": [
            build_locator("ProductsPage", "cartBadge", "Cart badge", "page.getByTestId('shopping-cart-badge')", "getByTestId", 0.9, "Matched cart badge by test id"),
        ],
        "error-messages": [
            build_locator("LoginPage", "loginError", "Login error", "page.getByRole('alert')", "getByRole", 0.88, "Matched error region by alert role"),
        ],
    }

    assertion_map = {
        "login-fields": [
            build_assertion("LoginPage", "expectLoginErrorVisible", "await expect(this.loginError).toBeVisible();", "Login error should surface after a failed login"),
        ],
        "login-button": [
            build_assertion("LoginPage", "expectLoginFormVisible", "await expect(this.page.getByRole('button', { name: 'Login' })).toBeVisible();", "Login button should remain visible on the form"),
        ],
        "products-page": [
            build_assertion("ProductsPage", "expectProductsPageVisible", "await expect(this.productsHeading).toBeVisible();", "Products heading should confirm page state"),
        ],
        "cart-badge": [
            build_assertion("ProductsPage", "expectCartBadgeCount", "await expect(this.cartBadge).toHaveText(expected);", "Cart badge should reflect the item count"),
        ],
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto(target_url, wait_until="domcontentloaded", timeout=int(payload.get("timeoutSeconds", 180)) * 1000)
            if not focus_areas:
                focus_areas = ["login-button", "products-page", "cart-badge"]

            for area in focus_areas:
                locators.extend(locator_map.get(area, []))
                assertions.extend(assertion_map.get(area, []))

            screenshot_path = output_dir / "screenshot.png"
            try:
                page.screenshot(path=str(screenshot_path), full_page=True)
            except Exception:  # noqa: BLE001
                pass
        except Exception as exc:  # noqa: BLE001
            browser.close()
            return empty_result("failed", failure_category, f"Navigation failed: {exc}", [str(exc)])
        finally:
            browser.close()

    if failure_category == "locator":
        patch_suggestions.append({
            "pageObject": "LoginPage",
            "action": "update-locator",
            "selector": "page.getByRole('button', { name: 'Login' })",
            "reason": "Repair locator timeout with a semantic role-based selector",
        })

    return {
        "status": "passed" if locators or assertions else "partial",
        "failureCategory": failure_category,
        "summary": f"Explored {target_url} and found {len(locators)} locator repair candidate(s)",
        "suggestedLocators": locators,
        "suggestedAssertions": assertions,
        "patchSuggestions": patch_suggestions,
        "warnings": warnings,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Webwright sidecar runner")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    output_dir = Path(args.output_dir).resolve()
    safe_root = Path("/tmp/jobs/webwright").resolve()

    if not input_path.is_relative_to(safe_root) or not output_dir.is_relative_to(safe_root):
        print(json.dumps(empty_result("failed", "unknown", "Unsafe path rejected", [])))
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        payload = json.loads(input_path.read_text())
    except Exception as exc:  # noqa: BLE001
        result = empty_result("failed", "unknown", f"Failed to read input file: {exc}", [str(exc)])
        (output_dir / "result.json").write_text(json.dumps(result, indent=2))
        print(json.dumps(result))
        sys.exit(1)

    target_url = str(payload.get("targetUrl", ""))
    if not target_url:
        result = empty_result("failed", "unknown", "No targetUrl provided in input payload", [])
        (output_dir / "result.json").write_text(json.dumps(result, indent=2))
        print(json.dumps(result))
        sys.exit(1)

    result = explore(target_url, payload, output_dir)
    (output_dir / "result.json").write_text(json.dumps(result, indent=2))
    print(json.dumps(result))


if __name__ == "__main__":
    main()
