"""
Webwright Sidecar Runner
========================

Entry point for the optional Webwright browser-agent sidecar.

Usage (called by WebwrightSidecarService.ts via child_process.spawn):
    python3 runner.py --input /tmp/jobs/webwright/<jobId>/input.json \
                      --output-dir /tmp/jobs/webwright/<jobId>/

The runner:
1. Reads the structured input JSON written by WebwrightTaskBuilder.
2. Uses Playwright to explore the target URL and collect stable locators.
3. Writes a structured result.json to --output-dir.
4. Exits 0 on success, non-zero on failure.

Security:
- Only navigates to the targetUrl and its same-origin sub-pages.
- Writes only inside --output-dir (validated at startup).
- Secrets are never logged.
- The Node.js parent kills the process after WEBWRIGHT_TIMEOUT_SECONDS.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import traceback
from pathlib import Path

# ---------------------------------------------------------------------------
# Schema helpers
# ---------------------------------------------------------------------------

def _empty_result(status: str, summary: str, warnings: list[str]) -> dict:
    return {
        "status": status,
        "summary": summary,
        "discoveredPages": [],
        "recommendedLocators": [],
        "recommendedAssertions": [],
        "repairSuggestions": [],
        "generatedExplorationScriptPath": None,
        "screenshots": [],
        "warnings": warnings,
    }


# ---------------------------------------------------------------------------
# Browser exploration logic
# ---------------------------------------------------------------------------

def explore(target_url: str, focus_areas: list[str], output_dir: Path, timeout_seconds: int = 180) -> dict:
    """
    Launch a headless Chromium browser, navigate to target_url, and collect
    stable locator candidates for each focus area.

    Returns a dict matching the WebwrightSidecarResult JSON schema.
    """
    try:
        from playwright.sync_api import sync_playwright  # type: ignore[import]
    except ImportError:
        return _empty_result(
            "failed",
            "playwright Python package is not installed in the sidecar virtualenv",
            ["Run: pip install playwright && playwright install chromium"],
        )

    discovered_pages: list[dict] = []
    recommended_locators: list[dict] = []
    recommended_assertions: list[dict] = []
    warnings: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        try:
            page.goto(target_url, wait_until="domcontentloaded", timeout=timeout_seconds * 1_000)
        except Exception as e:  # noqa: BLE001
            browser.close()
            return _empty_result("failed", f"Navigation failed: {e}", [str(e)])

        current_url = page.url
        page_title = page.title()
        discovered_pages.append(
            {
                "pageName": page_title or "Landing Page",
                "pageClass": _url_to_class_name(current_url),
                "elements": [],
            }
        )

        # Collect locator candidates for known focus areas
        for area in focus_areas:
            locators = _collect_for_area(page, area, warnings)
            recommended_locators.extend(locators)

        # Generic semantic assertion candidates
        recommended_assertions = _collect_assertions(page, focus_areas)

        # Screenshot for reference
        screenshot_path = output_dir / "screenshot.png"
        try:
            page.screenshot(path=str(screenshot_path), full_page=True)
        except Exception:  # noqa: BLE001
            pass

        browser.close()

    return {
        "status": "passed" if recommended_locators else "partial",
        "summary": f"Explored {target_url} — found {len(recommended_locators)} locator candidate(s)",
        "discoveredPages": discovered_pages,
        "recommendedLocators": recommended_locators,
        "recommendedAssertions": recommended_assertions,
        "repairSuggestions": [],
        "generatedExplorationScriptPath": None,
        "screenshots": [str(screenshot_path)] if screenshot_path.exists() else [],
        "warnings": warnings,
    }


def _url_to_class_name(url: str) -> str:
    """Derive a PascalCase page class name from a URL path segment."""
    path_part = url.rstrip("/").rsplit("/", 1)[-1] or "Home"
    return "".join(word.capitalize() for word in path_part.replace("-", "_").split("_")) + "Page"


_ARIA_ROLE_MAP: dict[str, dict] = {
    "login-fields": [
        {"role": "textbox", "name": "Username", "strategy": "role", "page": "LoginPage", "confidence": 0.9},
        {"role": "textbox", "name": "Password", "strategy": "role", "page": "LoginPage", "confidence": 0.9},
    ],
    "login-button": [
        {"role": "button", "name": "Login", "strategy": "role", "page": "LoginPage", "confidence": 0.9},
    ],
    "add-to-cart-button": [
        {"role": "button", "name": "Add to cart", "strategy": "role", "page": "ProductsPage", "confidence": 0.85},
    ],
    "cart-badge": [
        {"selector": "[class*='cart_badge']", "strategy": "css", "page": "ProductsPage", "confidence": 0.8},
    ],
    "error-messages": [
        {"selector": "[data-test='error']", "strategy": "data-test", "page": "LoginPage", "confidence": 0.85},
    ],
    "products-page": [
        {"role": "heading", "name": "Products", "strategy": "role", "page": "ProductsPage", "confidence": 0.85},
    ],
}


def _collect_for_area(page, area: str, warnings: list[str]) -> list[dict]:
    """Probe the live page for elements matching a focus area and return locator dicts."""
    candidates: list[dict] = []
    hint_list = _ARIA_ROLE_MAP.get(area, [])

    for hint in hint_list:
        selector_str: str | None = None
        try:
            if "role" in hint:
                selector_str = f"[role='{hint['role']}']"
                loc = page.get_by_role(hint["role"], name=hint.get("name", ""))
                if loc.count() > 0:
                    selector_str = f"getByRole('{hint['role']}', {{name: '{hint.get('name', '')}'}})"
                    candidates.append(
                        {
                            "selector": selector_str,
                            "strategy": hint.get("strategy", "role"),
                            "page": hint.get("page", "UnknownPage"),
                            "confidence": hint.get("confidence", 0.7),
                        }
                    )
            elif "selector" in hint:
                loc = page.locator(hint["selector"])
                if loc.count() > 0:
                    candidates.append(
                        {
                            "selector": hint["selector"],
                            "strategy": hint.get("strategy", "css"),
                            "page": hint.get("page", "UnknownPage"),
                            "confidence": hint.get("confidence", 0.7),
                        }
                    )
        except Exception:  # noqa: BLE001
            if selector_str:
                warnings.append(f"Could not probe selector '{selector_str}' for area '{area}'")

    return candidates


def _collect_assertions(page, focus_areas: list[str]) -> list[dict]:
    assertions: list[dict] = []
    if "login-fields" in focus_areas or "login-button" in focus_areas:
        assertions.append(
            {
                "description": "Error message visible on invalid login",
                "selector": "[data-test='error']",
                "assertionType": "toBeVisible",
                "page": "LoginPage",
            }
        )
    if "products-page" in focus_areas or "add-to-cart-button" in focus_areas:
        assertions.append(
            {
                "description": "Products/inventory page heading visible after login",
                "selector": "[role='heading']",
                "assertionType": "toBeVisible",
                "page": "ProductsPage",
            }
        )
    if "cart-badge" in focus_areas:
        assertions.append(
            {
                "description": "Cart badge shows item count after add-to-cart",
                "selector": "[class*='cart_badge']",
                "assertionType": "toHaveText",
                "expectedValue": "1",
                "page": "ProductsPage",
            }
        )
    return assertions


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Webwright sidecar runner")
    parser.add_argument("--input", required=True, help="Path to input JSON file written by WebwrightTaskBuilder")
    parser.add_argument("--output-dir", required=True, help="Directory to write result.json and screenshots into")
    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    output_dir = Path(args.output_dir).resolve()

    # Security: refuse paths outside /tmp to prevent directory traversal.
    # Use is_relative_to for a symlink-safe, cross-platform comparison.
    tmp_root = Path("/tmp").resolve()
    try:
        safe_input = input_path.resolve().is_relative_to(tmp_root)
    except AttributeError:
        # Fallback for Python < 3.9: resolve symlinks manually before comparison.
        try:
            Path(os.path.realpath(input_path)).relative_to(tmp_root)
            safe_input = True
        except ValueError:
            safe_input = False

    if not safe_input:
        print(json.dumps(_empty_result("failed", "Unsafe input path rejected", [])))
        sys.exit(1)

    # Security: validate output_dir is also within /tmp.
    try:
        safe_output = output_dir.resolve().is_relative_to(tmp_root)
    except AttributeError:
        try:
            Path(os.path.realpath(output_dir)).relative_to(tmp_root)
            safe_output = True
        except ValueError:
            safe_output = False

    if not safe_output:
        print(json.dumps(_empty_result("failed", "Unsafe output directory rejected", [])))
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        with open(input_path) as fh:
            payload = json.load(fh)
    except Exception as exc:  # noqa: BLE001
        result = _empty_result("failed", f"Failed to read input file: {exc}", [])
        (output_dir / "result.json").write_text(json.dumps(result, indent=2))
        sys.exit(1)

    target_url: str = payload.get("targetUrl", "")
    focus_areas: list[str] = payload.get("task", {}).get("focusAreas", [])
    timeout_seconds: int = int(payload.get("timeoutSeconds", 180))

    if not target_url:
        result = _empty_result("failed", "No targetUrl provided in input payload", [])
        (output_dir / "result.json").write_text(json.dumps(result, indent=2))
        sys.exit(1)

    try:
        result = explore(target_url, focus_areas, output_dir, timeout_seconds)
    except Exception:  # noqa: BLE001
        tb = traceback.format_exc()
        result = _empty_result("failed", "Unexpected error during exploration", [tb])

    result_path = output_dir / "result.json"
    result_path.write_text(json.dumps(result, indent=2))

    # Echo to stdout as well (WebwrightSidecarService reads either)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
