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


def is_domain_allowed(hostname: str, allowed_domains: list[str]) -> bool:
    hostname = (hostname or '').strip().lower().rstrip('.')
    if not hostname:
       return False
    if not allowed_domains:
       return True

    for allowed in allowed_domains:
       allowed = compact(allowed).lower().rstrip('.')
       if not allowed:
           continue
       if allowed.startswith('*.'):
           base = allowed[2:]
           if hostname == base:
               continue
           if hostname.endswith(f'.{base}'):
               return True
       elif hostname == allowed:
           return True
    return False


def validate_target_url(target_url: str, allowed_domains: list[str]) -> tuple[str | None, str | None]:
    parsed = urlparse(target_url or '')
    if parsed.scheme not in {'http', 'https'}:
        return None, f'Unsafe URL scheme: {parsed.scheme or "(missing)"}'
    if not parsed.hostname:
        return None, 'Target URL is missing a hostname'
    if not is_domain_allowed(parsed.hostname, allowed_domains):
        return None, f'Hostname {parsed.hostname} is not allowed'
    return target_url, None


def normalize_allowed_domains(raw: list[str] | None) -> list[str]:
    return [compact(item) for item in (raw or []) if compact(item)]


def resolve_page_object_name(page, page_objects: list[dict], failure_context: dict | None) -> str | None:
    if failure_context and isinstance(failure_context, dict):
       failed_page_object = compact(str(failure_context.get('failedPageObject') or ''))
       if failed_page_object:
           for page_object in page_objects:
               if page_object.get('className') == failed_page_object:
                   return failed_page_object

    if not page_objects:
       return build_page_object(page)

    title = compact(page.title()).lower()
    url = compact(page.url).lower()
    context_bits = ' '.join(
       compact(str(value)).lower()
       for value in [
           failure_context.get('failedTestTitle') if isinstance(failure_context, dict) else '',
           failure_context.get('failedSelector') if isinstance(failure_context, dict) else '',
           failure_context.get('failedAssertion') if isinstance(failure_context, dict) else '',
       ]
    )
    haystack = f'{title} {url} {context_bits}'

    for page_object in page_objects:
       class_name = str(page_object.get('className') or '')
       feature = str(page_object.get('feature') or '')
       tokens = [class_name.lower(), feature.lower(), feature.replace('-', ' ').lower()]
       if any(token and token in haystack for token in tokens):
           return class_name or None

    return None


def resolve_selector_locator(page, selector: str):
    direct = selector.strip().removeprefix('page.').removeprefix('this.page.')
    if direct.startswith('getByTestId('):
       value = strip_quotes(direct[len('getByTestId('):-1])
       return page.get_by_test_id(value)
    if direct.startswith('getByLabel('):
       value = strip_quotes(direct[len('getByLabel('):-1])
       return page.get_by_label(value)
    if direct.startswith('getByPlaceholder('):
       value = strip_quotes(direct[len('getByPlaceholder('):-1])
       return page.get_by_placeholder(value)
    if direct.startswith('getByText('):
       value = strip_quotes(direct[len('getByText('):-1])
       return page.get_by_text(value)
    if direct.startswith('getByRole('):
       match = re.match(r"getByRole\(\s*['\"]([^'\"]+)['\"](?:\s*,\s*\{\s*([^}]*)\s*\})?\s*\)$", direct)
       if match:
           role = match.group(1)
           options = match.group(2) or ''
           name_match = re.search(r"name:\s*['\"]([^'\"]+)['\"]", options)
           level_match = re.search(r"level:\s*(\d+)", options)
           kwargs = {}
           if name_match:
               kwargs['name'] = name_match.group(1)
           if level_match:
               kwargs['level'] = int(level_match.group(1))
           return page.get_by_role(role, **kwargs)
    if direct.startswith('locator('):
        value = strip_quotes(direct[len('locator('):-1])
        return page.locator(value)
    return None


def apply_replay_plan(page, replay_plan: dict, generated_data: dict, warnings: list[str]) -> None:
    for step in replay_plan.get('steps', []):
        action = step.get('action')
        selector = step.get('selector')
        try:
            if action == 'navigate':
                continue
            if not selector:
                warnings.append(f'Replay step "{action} {step.get("target", "")}" is missing a selector')
                continue
            locator = resolve_selector_locator(page, selector)
            if locator is None:
                warnings.append(f'Replay selector could not be resolved: {selector}')
                continue
            if action == 'fill':
                value_ref = step.get('valueRef')
                value = resolve_value_ref(generated_data, value_ref)
                if value is None:
                    warnings.append(f'Replay value reference could not be resolved: {value_ref}')
                    continue
                locator.fill(value)
            elif action == 'select':
                value_ref = step.get('valueRef')
                value = resolve_value_ref(generated_data, value_ref) or value_ref
                if not value:
                    warnings.append(f'Replay select step missing a value: {selector}')
                    continue
                locator.select_option(value)
            elif action == 'check':
                locator.check()
            elif action == 'uncheck':
                locator.uncheck()
            elif action in {'assertVisible', 'assertText'}:
                locator.wait_for(state='visible', timeout=2000)
            else:
                locator.click()
        except Exception as exc:
            warnings.append(f'Replay step failed for {step.get("target", action)}: {exc}')


def resolve_value_ref(generated_data: dict, ref: str | None) -> str | None:
    if not ref:
        return None
    parts = ref.split('.')
    if len(parts) == 2 and parts[0] in {'validUser', 'invalidUser'}:
        bucket = generated_data.get('credentials', {}).get(parts[0], {})
        value = bucket.get(parts[1])
        return value if isinstance(value, str) and value else None
    if len(parts) == 2 and parts[0] == 'inputs':
        value = generated_data.get('inputs', {}).get(parts[1])
        return value if isinstance(value, str) and value else None
    return None


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
    replay_plan = payload.get('replayPlan', {}) if isinstance(payload.get('replayPlan', {}), dict) else {}
    generated_data = payload.get('generatedData', {}) if isinstance(payload.get('generatedData', {}), dict) else {}
    page_objects = payload.get('pageObjects', []) if isinstance(payload.get('pageObjects', []), list) else []
    failure_context = payload.get('failureContext', {}) if isinstance(payload.get('failureContext', {}), dict) else {}
    allowed_domains = normalize_allowed_domains(payload.get('allowedDomains') if isinstance(payload.get('allowedDomains'), list) else [])
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
            validated_target, error = validate_target_url(target_url, allowed_domains)
            if error:
                return empty_result('failed', failure_category, f'Navigation rejected: {error}', [error])

            page.goto(validated_target, wait_until='domcontentloaded', timeout=timeout_seconds * 1000)
            if not is_domain_allowed(urlparse(page.url).hostname or '', allowed_domains):
                return empty_result('failed', failure_category, f'Redirect rejected: {page.url}', [f'Redirected to disallowed hostname: {page.url}'])

            if replay_plan:
                apply_replay_plan(page, replay_plan, generated_data, warnings)

            page_object = resolve_page_object_name(page, page_objects, failure_context)
            if page_objects and not page_object:
                warnings.append('No safe page object mapping found; suggestions suppressed')
            elif page_object:
                snapshot = snapshot_elements(page)
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
