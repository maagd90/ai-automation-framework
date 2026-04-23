import { LocatorCandidate, ElementNode } from '../domain';
import { isDynamicValue } from '@ai-locator/shared';

export class CandidateBuilder {
  build(element: ElementNode): LocatorCandidate[] {
    const candidates: LocatorCandidate[] = [];

    this.addTestIdCandidates(element, candidates);
    this.addRoleCandidates(element, candidates);
    this.addLabelCandidates(element, candidates);
    this.addIdCandidates(element, candidates);
    this.addNameCandidates(element, candidates);
    this.addCssCandidates(element, candidates);
    this.addTextCandidates(element, candidates);
    this.addXPathCandidates(element, candidates);
    this.addFallbackCssCandidates(element, candidates);

    return candidates;
  }

  private addTestIdCandidates(element: ElementNode, candidates: LocatorCandidate[]): void {
    const testIdAttrs = ['data-testid', 'data-test', 'data-cy', 'data-test-id'];
    for (const attr of testIdAttrs) {
      const val = element.attributes[attr];
      if (val) {
        candidates.push({ strategy: 'data-testid', value: `[${attr}="${val}"]`, score: 100 });
      }
    }
  }

  private addRoleCandidates(element: ElementNode, candidates: LocatorCandidate[]): void {
    const role = element.role ?? element.attributes['role'];
    const name = element.accessibilityNode?.name ?? element.text;
    if (role && name) {
      candidates.push({
        strategy: 'role',
        value: `role=${role}[name="${name}"]`,
        score: 90,
      });
    }
  }

  private addLabelCandidates(element: ElementNode, candidates: LocatorCandidate[]): void {
    const label = element.accessibilityNode?.label ?? element.attributes['aria-label'] ?? element.attributes['aria-labelledby'];
    if (label) {
      candidates.push({ strategy: 'label', value: label, score: 85 });
    }
  }

  private addIdCandidates(element: ElementNode, candidates: LocatorCandidate[]): void {
    const id = element.attributes['id'];
    if (id && !isDynamicValue(id)) {
      candidates.push({ strategy: 'css', value: `#${id}`, score: 80 });
    }
  }

  private addNameCandidates(element: ElementNode, candidates: LocatorCandidate[]): void {
    const name = element.attributes['name'];
    if (name && !isDynamicValue(name)) {
      candidates.push({ strategy: 'css', value: `${element.tag}[name="${name}"]`, score: 70 });
    }
  }

  private addCssCandidates(element: ElementNode, candidates: LocatorCandidate[]): void {
    const stableAttrs = ['type', 'placeholder', 'href', 'for', 'aria-label'];
    for (const attr of stableAttrs) {
      const val = element.attributes[attr];
      if (val && !isDynamicValue(val)) {
        candidates.push({
          strategy: 'css',
          value: `${element.tag}[${attr}="${val}"]`,
          score: 65,
        });
      }
    }
  }

  private addTextCandidates(element: ElementNode, candidates: LocatorCandidate[]): void {
    const text = element.text?.trim();
    if (text && text.length > 0 && text.length < 50) {
      candidates.push({ strategy: 'text', value: text, score: 60 });
    }
  }

  private addXPathCandidates(element: ElementNode, candidates: LocatorCandidate[]): void {
    const id = element.attributes['id'];
    if (id && !isDynamicValue(id)) {
      candidates.push({
        strategy: 'xpath',
        value: `//${element.tag}[@id="${id}"]`,
        score: 50,
      });
    } else if (element.text) {
      candidates.push({
        strategy: 'xpath',
        value: `//${element.tag}[normalize-space(text())="${element.text.trim()}"]`,
        score: 40,
      });
    }
  }

  private addFallbackCssCandidates(element: ElementNode, candidates: LocatorCandidate[]): void {
    const classes = (element.attributes['class'] ?? '')
      .split(' ')
      .filter((c) => c && !isDynamicValue(c))
      .slice(0, 2)
      .join('.');

    if (classes) {
      candidates.push({
        strategy: 'css',
        value: `${element.tag}.${classes}`,
        score: 30,
      });
    } else {
      candidates.push({ strategy: 'css', value: element.tag, score: 10 });
    }
  }
}
