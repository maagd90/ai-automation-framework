import { ElementNode, AccessibilityNode } from '../domain';

export class ElementNormalizer {
  normalize(raw: Partial<ElementNode>, a11y?: AccessibilityNode): ElementNode {
    return {
      tag: raw.tag ?? 'div',
      id: raw.id,
      role: raw.role ?? a11y?.role,
      text: raw.text ?? a11y?.name ?? '',
      name: raw.name,
      label: raw.label ?? a11y?.label,
      placeholder: raw.placeholder,
      type: raw.type,
      href: raw.href,
      ariaLabel: raw.ariaLabel ?? a11y?.name,
      attributes: raw.attributes ?? {},
      framePath: raw.framePath ?? [],
      a11y,
    };
  }
}
