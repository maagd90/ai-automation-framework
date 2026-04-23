import { ElementNode, LocatorCandidate } from '../domain';
import { isDynamicValue } from '@locator-agent/shared';

export class CandidateBuilder {
  build(element: ElementNode): LocatorCandidate[] {
    const candidates: LocatorCandidate[] = [];

    // 1. data-testid / data-test / data-cy
    const testId = element.attributes['data-testid'] ?? element.attributes['data-test'] ?? element.attributes['data-cy'];
    if (testId) {
      const attr = element.attributes['data-testid'] ? 'data-testid' : element.attributes['data-test'] ? 'data-test' : 'data-cy';
      candidates.push({ strategy: 'css-testid', value: `[${attr}="${testId}"]`, score: 0 });
    }

    // 2. role + accessible name
    const roleName = element.role ?? element.a11y?.role;
    const accessibleName = element.ariaLabel ?? element.a11y?.name ?? element.text;
    if (roleName && accessibleName) {
      candidates.push({ strategy: 'role', value: `getByRole('${roleName}', { name: '${accessibleName}' })`, score: 0 });
    }

    // 3. label
    const labelText = element.label ?? element.a11y?.label;
    if (labelText) {
      candidates.push({ strategy: 'label', value: `getByLabel('${labelText}')`, score: 0 });
    }

    // 4. stable unique id
    if (element.id && !isDynamicValue(element.id)) {
      candidates.push({ strategy: 'css-id', value: `#${element.id}`, score: 0 });
    }

    // 5. name attribute
    if (element.name) {
      candidates.push({ strategy: 'css-name', value: `[name="${element.name}"]`, score: 0 });
    }

    // 6. semantic CSS with type
    if (element.tag && element.type) {
      candidates.push({ strategy: 'css-semantic', value: `${element.tag}[type="${element.type}"]`, score: 0 });
    }

    // 7. text
    const textContent = element.text ?? element.a11y?.name;
    if (textContent && textContent.trim()) {
      candidates.push({ strategy: 'text', value: `getByText('${textContent.trim()}')`, score: 0 });
    }

    // 8. relative XPath
    if (textContent && textContent.trim()) {
      candidates.push({ strategy: 'xpath', value: `//${element.tag}[normalize-space()='${textContent.trim()}']`, score: 0 });
    }

    // 9. structural CSS fallback
    candidates.push({ strategy: 'css-structural', value: `${element.tag}:nth-of-type(1)`, score: 0 });

    return candidates;
  }
}
