"""Webwright sidecar runner.

Explores the live DOM generically and returns JSON repair suggestions.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse


SAFE_OUTPUT_BASE = Path('/tmp/jobs/webwright').resolve()


def compact(value: str | None) -> str:
    return re.sub(r"\s+", ' ', value or '').strip()


def slugify(value: str, fallback: str = 'page') -> str:
    tokens = re.sub(r"[^a-zA-Z0-9]+", ' ', value).strip().split()
    if not tokens:
        tokens = [fallback]
    return ''.join(token[:1].upper() + token[1:] for token in tokens)


def camelize(value: str, fallback: str = 'locator') -> str:
    tokens = re.sub(r"[^a-zA-Z0-9]+", ' ', value).strip().split()
    if not tokens:
        return fallback
    return tokens[0].lower() + ''.join(token[:1].upper() + token[1:] for token in tokens[1:])


def empty_result(status: str, failure_category: str, summary: str, warnings: list[str]) -> dict:
    return {
        'status': status,
        'failureCategory': failure_category,
        'summary': summary,
        'suggestedLocators': [],
        'suggestedAssertions': [],
        'patchSuggestions': [],
        'warnings': warnings,
        'screenshots': [],
        'recommendedLocators': [],
        'recommendedAssertions': [],
        'discoveredPages': [],
        'repairSuggestions': [],
    }


def classify(payload: dict, fallback: str = 'unknown') -> str:
    return str(payload.get('failureCategory') or fallback)


def build_locator(page_object: str, field_name: str, target: str, selector: str, strategy: str, confidence: float, reason: str) -> dict:
    return {
        'pageObject': page_object,
        'fieldName': field_name,
        'target': target,
        'selector': selector,
        'strategy': strategy,
        'confidenceScore': confidence,
        'reason': reason,
    }


def build_assertion(page_object: str, method_name: str, assertion: str, reason: str, expected_value: str | None = None) -> dict:
    result = {
        'pageObject': page_object,
        'methodName': method_name,
        'assertion': assertion,
        'reason': reason,
    }
    if expected_value is not None:
        result['expectedValue'] = expected_value
    return result


def build_page_object(page) -> str:
    title = compact(page.title())
    if title:
        return f"{slugify(title)}Page"
    parsed = urlparse(page.url)
    path_bits = [bit for bit in parsed.path.split('/') if bit]
    if path_bits:
        return f"{slugify(path_bits[-1])}Page"
    return 'Page'


def snapshot_elements(page) -> list[dict]:
    selector = 'a,button,input,textarea,select,[role],[data-testid],[data-test],label,h1,h2,h3,h4,h5,h6,p,li,article,section,nav,form'
    return page.locator(selector).evaluate_all(
        r"""
        (elements) => elements.map((el) => {
          const labels = el.labels ? Array.from(el.labels).map((label) => label.textContent || '').map((value) => value.trim()).filter(Boolean) : [];
          const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
          return {
            tag: el.tagName.toLowerCase(),
            type: el.getAttribute('type') || '',
            role: el.getAttribute('role') || '',
            text,
            ariaLabel: el.getAttribute('aria-label') || '',
            placeholder: el.getAttribute('placeholder') || '',
            testId: el.getAttribute('data-testid') || el.getAttribute('data-test') || '',
            id: el.getAttribute('id') || '',
            name: el.getAttribute('name') || '',
            href: el.getAttribute('href') || '',
            labels,
          };
        })
        """,
    )


def candidate_name(entry: dict) -> str:
    values = [entry.get('ariaLabel'), entry.get('placeholder'), entry.get('labels'), entry.get('text'), entry.get('testId'), entry.get('name')]
    for value in values:
        if isinstance(value, list):
            value = ' '.join(value)
        if isinstance(value, str) and compact(value):
            return compact(value)
    return entry.get('tag') or 'element'


def build_selector(entry: dict) -> tuple[str, str, float, str, str, str | None]:
    name = candidate_name(entry)
    tag = entry.get('tag', '')
    test_id = compact(entry.get('testId'))
    aria_label = compact(entry.get('ariaLabel'))
    placeholder = compact(entry.get('placeholder'))
    labels = compact(' '.join(entry.get('labels') or []))
    text = compact(entry.get('text'))

    if test_id:
        return (f"page.getByTestId({json.dumps(test_id)})", 'getByTestId', 0.98, test_id, f'Matched data-testid {test_id}', None)

    if placeholder and tag == 'input':
        expected = placeholder
        return (f"page.getByPlaceholder({json.dumps(placeholder)})", 'getByPlaceholder', 0.94, expected, f'Matched placeholder {placeholder}', expected)

    if labels and tag == 'input':
        expected = labels
        return (f"page.getByLabel({json.dumps(labels)})", 'getByLabel', 0.93, expected, f'Matched label {labels}', expected)

    if aria_label and tag in {'button', 'a', 'input'}:
        role = 'button' if tag == 'button' else 'link' if tag == 'a' else 'textbox'
        selector = f"page.getByRole({json.dumps(role)}, {{ name: {json.dumps(aria_label)} }})"
        return (selector, 'getByRole', 0.92, aria_label, f'Matched aria-label {aria_label}', aria_label if role != 'textbox' else None)

    if tag == 'button':
        selector = f"page.getByRole('button', {{ name: {json.dumps(name)} }})"
        return (selector, 'getByRole', 0.9, name, f'Matched button text {name}', name)

    if tag == 'a':
        selector = f"page.getByRole('link', {{ name: {json.dumps(name)} }})"
        return (selector, 'getByRole', 0.88, name, f'Matched link text {name}', name)

    if tag in {'h1', 'h2', 'h3', 'h4', 'h5', 'h6'} and text:
        level = tag[1]
        selector = f"page.getByRole('heading', {{ level: {level}, name: {json.dumps(text)} }})"
        return (selector, 'getByRole', 0.9, text, f'Matched heading {text}', text)

    if text and len(text) <= 80:
        selector = f"page.getByText({json.dumps(text)})"
        return (selector, 'getByText', 0.78, text, f'Matched visible text {text}', text)

    css_selector = tag if tag else 'div'
    if entry.get('id'):
        css_selector = f"#{entry['id']}"
    elif entry.get('name'):
        css_selector = f"{tag}[name={json.dumps(entry['name'])}]"

    return (f"page.locator({json.dumps(css_selector)})", 'css', 0.65, name, f'Used fallback CSS selector {css_selector}', text or None)


def normalize_focus_terms(focus_areas: list[str]) -> set[str]:
    terms: set[str] = set()
    for area in focus_areas:
        for token in re.split(r'[^a-zA-Z0-9]+', area.lower()):
            if token:
                terms.add(token)
    return terms


def entry_score(entry: dict, focus_terms: set[str]) -> float:
    score = 0.0
    tag = entry.get('tag', '')
    text = compact(entry.get('text')).lower()
    aria = compact(entry.get('ariaLabel')).lower()
    placeholder = compact(entry.get('placeholder')).lower()
    labels = compact(' '.join(entry.get('labels') or [])).lower()
    test_id = compact(entry.get('testId')).lower()
    name = candidate_name(entry).lower()

    if tag in {'button', 'a'}:
        score += 3.0
    elif tag in {'input', 'textarea'}:
        score += 2.0
    elif tag in {'form', 'nav'}:
        score += 1.0

    if test_id:
        score += 2.5
    if aria:
        score += 2.0
    if labels:
        score += 1.5
    if placeholder:
        score += 1.5
    if text:
        score += min(len(text) / 30.0, 1.5)

    if any(term in name for term in focus_terms):
        score += 2.0
    if any(term in text for term in focus_terms):
        score += 2.0
    if any(term in aria for term in focus_terms):
        score += 2.0
    if any(term in placeholder for term in focus_terms):
        score += 1.5
    if any(term in labels for term in focus_terms):
        score += 1.5

    if 'submit' in text or 'submit' in aria or 'submit' in name:
        score += 0.5
    if 'logout' in text or 'delete' in text or 'remove' in text:
        score -= 1.5

    return score


def get_entry_locator(page, entry: dict):
    selector = build_selector(entry)
    kind = selector[1]
    target = selector[0].replace('page.', '')
    if kind == 'getByTestId':
        return page.get_by_test_id(target[target.find('(') + 1:-1].strip('"\''))
    if kind == 'getByPlaceholder':
        value = target[target.find('(') + 1:-1].strip("\"'")
        return page.get_by_placeholder(value)
    if kind == 'getByLabel':
        value = target[target.find('(') + 1:-1].strip("\"'")
        return page.get_by_label(value)
    if kind == 'getByRole':
        if 'heading' in target:
            match = re.search(r"name:\s*(['\"])(.*?)\1", target)
            level = re.search(r"level:\s*(\d+)", target)
            name = match.group(2) if match else ''
            return page.get_by_role('heading', level=int(level.group(1)) if level else None, name=name)
        match = re.search(r"getByRole\((['\"])(.*?)\1(?:,\s*\{\s*name:\s*(['\"])(.*?)\3\s*\})?\)", target)
        if match:
            role = match.group(2)
            name = match.group(4) if match.group(4) else None
            return page.get_by_role(role, name=name)
    if kind == 'getByText':
        value = target[target.find('(') + 1:-1].strip("\"'")
        return page.get_by_text(value)
    if kind == 'css':
        value = target[target.find('(') + 1:-1].strip("\"'")
        return page.locator(value)
    return None


def try_login(page, entries: list[dict], warnings: list[str]) -> bool:
    password = None
    username = None
    for entry in entries:
        tag = entry.get('tag', '')
        if tag != 'input':
            continue
        input_type = (entry.get('type') or '').lower()
        if input_type == 'password' and password is None:
            password = entry
        elif input_type in {'text', 'email', ''} and username is None:
            username = entry

    if password is None:
        return False

    try:
        if username is not None:
            locator = get_entry_locator(page, username)
            if locator is not None:
                locator.fill('webwright-user')
        password_locator = get_entry_locator(page, password)
        if password_locator is None:
            password_locator = page.locator('input[type="password"]').first
        password_locator.fill('webwright-pass')
    except Exception as exc:
        warnings.append(f'Unable to fill login form: {exc}')
        return False

    try:
        submit = page.locator('button[type="submit"], input[type="submit"], form button').first
        if submit.count() > 0:
            submit.click()
            return True
    except Exception as exc:
        warnings.append(f'Unable to submit login form: {exc}')
        return False

    return False


def try_advance_state(page, entries: list[dict], focus_terms: set[str], warnings: list[str], max_clicks: int = 3) -> bool:
    candidates = [entry for entry in entries if entry.get('tag') in {'button', 'a'}]
    candidates.sort(key=lambda entry: entry_score(entry, focus_terms), reverse=True)

    clicked = False
    for entry in candidates[:max_clicks]:
        try:
            locator = get_entry_locator(page, entry)
            if locator is None:
                continue
            if locator.count() <= 0:
                continue
            locator.click()
            clicked = True
            try:
                page.wait_for_load_state('domcontentloaded', timeout=1500)
            except Exception:
                pass
            try:
                page.wait_for_timeout(250)
            except Exception:
                pass
        except Exception as exc:
            warnings.append(f'Unable to advance page state: {exc}')
    return clicked


def discover_states(page, focus_areas: list[str], warnings: list[str]) -> list[tuple[str, list[dict]]]:
    states: list[tuple[str, list[dict]]] = []
    focus_terms = normalize_focus_terms(focus_areas)
    page_object = build_page_object(page)
    entries = snapshot_elements(page)
    states.append((page_object, entries))

    if try_login(page, entries, warnings):
        try:
            page.wait_for_load_state('domcontentloaded', timeout=1500)
        except Exception:
            pass
        states.append((build_page_object(page), snapshot_elements(page)))
        entries = states[-1][1]

    for _ in range(3):
        if not try_advance_state(page, entries, focus_terms, warnings):
            break
        try:
            page.wait_for_load_state('domcontentloaded', timeout=1500)
        except Exception:
            pass
        next_entries = snapshot_elements(page)
        if next_entries == entries:
            break
        entries = next_entries
        states.append((build_page_object(page), entries))

    return states


def build_locators_from_snapshot(page_object: str, snapshot: list[dict]) -> tuple[list[dict], list[dict], list[dict]]:
    locators: list[dict] = []
    assertions: list[dict] = []
    patch_suggestions: list[dict] = []
    seen: set[str] = set()

    for entry in snapshot:
        selector, strategy, confidence, target, reason, expected_value = build_selector(entry)
        if selector in seen:
            continue
        seen.add(selector)
        field_name = camelize(target or entry.get('tag') or 'element')
        locators.append(build_locator(page_object, field_name, target, selector, strategy, confidence, reason))
        assertion_selector = selector.replace('page.', 'this.page.')

        if expected_value:
            assertion = f"await expect({assertion_selector}).toHaveText(expected);"
            assertions.append(build_assertion(page_object, f"expect{slugify(field_name)}Text", assertion, reason, expected_value))
        elif entry.get('tag') in {'button', 'a', 'h1', 'h2', 'h3'}:
            assertion = f"await expect({assertion_selector}).toBeVisible();"
            assertions.append(build_assertion(page_object, f"expect{slugify(field_name)}Visible", assertion, reason))

    if locators:
        patch_suggestions.append({
            'pageObject': page_object,
            'action': 'update-locator',
            'selector': locators[0]['selector'],
            'reason': 'Use the strongest semantic locator discovered on the live page',
        })

    return locators, assertions, patch_suggestions


def run_payload(payload: dict, output_dir: Path) -> dict:
    try:
        from playwright.sync_api import sync_playwright  # type: ignore[import]
    except ImportError:
        return empty_result('failed', classify(payload, 'unknown'), 'playwright is not installed in the sidecar environment', ['Install playwright in the sidecar environment'])

    task = payload.get('task', {}) if isinstance(payload.get('task', {}), dict) else {}
    failure_category = classify(payload, 'unknown')
    target_url = str(payload.get('targetUrl', ''))
    focus_areas = [str(item) for item in task.get('focusAreas', []) if isinstance(item, str)]
    warnings: list[str] = []
    locators: list[dict] = []
    assertions: list[dict] = []
    patch_suggestions: list[dict] = []
    screenshots: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            timeout_seconds = int(payload.get('timeoutSeconds', 180))
            page.goto(target_url, wait_until='domcontentloaded', timeout=timeout_seconds * 1000)
            states = discover_states(page, focus_areas, warnings)

            for page_object, snapshot in states:
                state_locators, state_assertions, state_patches = build_locators_from_snapshot(page_object, snapshot)
                locators.extend(state_locators)
                assertions.extend(state_assertions)
                patch_suggestions.extend(state_patches)

            screenshot_path = output_dir / 'screenshot.png'
            try:
                page.screenshot(path=str(screenshot_path), full_page=True)
                screenshots.append(str(screenshot_path))
            except Exception:
                pass
        except Exception as exc:  # noqa: BLE001
            browser.close()
            return empty_result('failed', failure_category, f'Navigation failed: {exc}', [str(exc)])
        finally:
            browser.close()

    unique_locators: list[dict] = []
    seen_selectors: set[str] = set()
    for locator in locators:
        if locator['selector'] in seen_selectors:
            continue
        seen_selectors.add(locator['selector'])
        unique_locators.append(locator)

    unique_assertions: list[dict] = []
    seen_methods: set[str] = set()
    for assertion in assertions:
        if assertion['methodName'] in seen_methods:
            continue
        seen_methods.add(assertion['methodName'])
        unique_assertions.append(assertion)

    discovered_pages = [
        {
            'pageName': page_object,
            'pageClass': page_object,
            'elements': [locator['fieldName'] for locator in unique_locators if locator['pageObject'] == page_object],
        }
        for page_object in {locator['pageObject'] for locator in unique_locators}
    ]

    summary = f'Explored {target_url} and found {len(unique_locators)} locator candidate(s)'
    result = {
        'status': 'passed' if unique_locators or unique_assertions else 'partial',
        'failureCategory': failure_category,
        'summary': summary,
        'suggestedLocators': unique_locators,
        'suggestedAssertions': unique_assertions,
        'patchSuggestions': patch_suggestions,
        'warnings': warnings,
        'screenshots': screenshots,
        'recommendedLocators': [
            {
                'selector': locator['selector'].replace('page.', ''),
                'strategy': locator['strategy'],
                'page': locator['pageObject'],
                'confidence': locator['confidenceScore'],
                'description': locator['reason'],
            }
            for locator in unique_locators
        ],
        'recommendedAssertions': [
            {
                'description': assertion['reason'],
                'selector': assertion['assertion'],
                'assertionType': 'custom',
                'page': assertion['pageObject'],
                'expectedValue': assertion.get('expectedValue'),
            }
            for assertion in unique_assertions
        ],
        'discoveredPages': discovered_pages,
        'repairSuggestions': patch_suggestions,
    }

    if failure_category == 'locator' and unique_locators:
        result['repairSuggestions'].append({
            'brokenSelector': '',
            'suggestedSelector': unique_locators[0]['selector'].replace('page.', ''),
            'strategy': 'update-locator',
            'reason': 'Generic live-page locator replacement',
        })

    return result


def main() -> None:
    parser = argparse.ArgumentParser(description='Webwright sidecar runner')
    parser.add_argument('--input', required=False)
    parser.add_argument('--output-dir', required=False)
    args = parser.parse_args()

    if not args.input or not args.output_dir:
        print(json.dumps(empty_result('failed', 'unknown', 'Missing required arguments', [])))
        sys.exit(1)

    input_path = Path(args.input).resolve()
    output_dir = Path(args.output_dir).resolve()

    if not input_path.is_relative_to(SAFE_OUTPUT_BASE) or not output_dir.is_relative_to(SAFE_OUTPUT_BASE):
        result = empty_result('failed', 'unknown', 'Unsafe path rejected', [])
        print(json.dumps(result))
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        payload = json.loads(input_path.read_text())
    except Exception as exc:  # noqa: BLE001
        result = empty_result('failed', 'unknown', f'Failed to read input file: {exc}', [str(exc)])
        (output_dir / 'result.json').write_text(json.dumps(result, indent=2))
        print(json.dumps(result))
        sys.exit(1)

    target_url = str(payload.get('targetUrl', ''))
    if not target_url:
        result = empty_result('failed', 'unknown', 'No targetUrl provided in input payload', [])
        (output_dir / 'result.json').write_text(json.dumps(result, indent=2))
        print(json.dumps(result))
        sys.exit(1)

    result = run_payload(payload, output_dir)
    (output_dir / 'result.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))


if __name__ == '__main__':
    main()
