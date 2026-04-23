import { ElementNode, AccessibilityNode } from '../domain';
import { generateId, isDynamicValue } from '@ai-locator/shared';

interface RawDomElement {
  tag: string;
  id?: string;
  classes?: string[];
  role?: string;
  text?: string;
  attributes: Record<string, string>;
  framePath?: string[];
}

export class ElementNormalizer {
  normalize(domElement: RawDomElement, a11yNode?: AccessibilityNode): ElementNode {
    const elementId = generateId(
      `${domElement.tag}-${domElement.attributes['data-testid'] ?? domElement.id ?? domElement.text ?? JSON.stringify(domElement.attributes)}`
    );

    return {
      elementId,
      tag: domElement.tag,
      role: a11yNode?.role ?? domElement.role,
      text: domElement.text?.trim(),
      attributes: this.filterAttributes(domElement.attributes),
      locators: [],
      framePath: domElement.framePath ?? [],
      accessibilityNode: a11yNode,
    };
  }

  private filterAttributes(attrs: Record<string, string>): Record<string, string> {
    const filtered: Record<string, string> = {};
    for (const [key, value] of Object.entries(attrs)) {
      if (value && !isDynamicValue(value)) {
        filtered[key] = value;
      } else if (value && (key.startsWith('data-') || key === 'name' || key === 'type' || key === 'role')) {
        filtered[key] = value;
      }
    }
    return filtered;
  }
}
