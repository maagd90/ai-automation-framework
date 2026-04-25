import type { ElementNode } from '../domain/ElementNode.js';
import type { LocatorCandidate } from '../domain/LocatorCandidate.js';
import { StringUtils } from '../../utils/StringUtils.js';

export class LocatorCandidateBuilder {
  build(element: ElementNode): LocatorCandidate[] {
    const candidates: LocatorCandidate[] = [];
    const role = element.role ?? element.inferredRole ?? this.tagToRole(element.tagName);

    if (element.dataTestId) {
      candidates.push({
        strategy: 'getByTestId',
        value: element.dataTestId,
        score: 0,
        validated: false,
        unique: false,
      });
    }

    if (element.associatedLabel) {
      candidates.push({
        strategy: 'getByLabel',
        value: element.associatedLabel,
        score: 0,
        validated: false,
        unique: false,
      });
    }

    if (element.ariaLabel) {
      candidates.push({
        strategy: 'getByRole',
        value: JSON.stringify({ role, name: element.ariaLabel }),
        score: 0,
        validated: false,
        unique: false,
      });
    }

    if (element.text && this.isSemanticTag(element.tagName)) {
      candidates.push({
        strategy: 'getByRole',
        value: JSON.stringify({ role, name: element.text }),
        score: 0,
        validated: false,
        unique: false,
      });
    }

    if (element.placeholder) {
      candidates.push({
        strategy: 'getByPlaceholder',
        value: element.placeholder,
        score: 0,
        validated: false,
        unique: false,
      });
    }

    if (element.id && !StringUtils.isDynamicId(element.id)) {
      candidates.push({
        strategy: 'cssId',
        value: `#${element.id}`,
        score: 0,
        validated: false,
        unique: false,
      });
    }

    if (element.name) {
      candidates.push({
        strategy: 'cssName',
        value: `[name="${element.name}"]`,
        score: 0,
        validated: false,
        unique: false,
      });
    }

    if (element.text && element.text.length <= 50) {
      candidates.push({
        strategy: 'getByText',
        value: element.text,
        score: 0,
        validated: false,
        unique: false,
      });
    }

    const cssFallback = this.buildCssSelector(element);
    if (cssFallback) {
      candidates.push({
        strategy: 'css',
        value: cssFallback,
        score: 0,
        validated: false,
        unique: false,
      });
    }

    if (element.text) {
      candidates.push({
        strategy: 'xpath',
        value: `//${element.tagName}[normalize-space()='${element.text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}']`,
        score: 0,
        validated: false,
        unique: false,
      });
    }

    return candidates;
  }

  private buildCssSelector(element: ElementNode): string | undefined {
    const parts: string[] = [element.tagName];
    if (element.type) parts.push(`[type="${element.type}"]`);
    if (element.name) parts.push(`[name="${element.name}"]`);
    return parts.length > 1 ? parts.join('') : undefined;
  }

  private isSemanticTag(tagName: string): boolean {
    return ['button', 'a', 'input', 'select', 'textarea'].includes(tagName);
  }

  private tagToRole(tagName: string): string {
    const roleMap: Record<string, string> = {
      button: 'button',
      a: 'link',
      input: 'textbox',
      select: 'combobox',
      textarea: 'textbox',
    };
    return roleMap[tagName] ?? tagName;
  }
}
