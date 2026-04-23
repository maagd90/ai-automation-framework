import { Page } from 'playwright';
import { ElementNode } from '@ai-locator/core';
import { createLogger, generateId } from '@ai-locator/shared';

const INTERACTIVE_TAGS = ['button', 'input', 'a', 'select', 'textarea', 'label', 'form', '[role]', '[data-testid]'];

interface RawElement {
  tag: string;
  id: string;
  classes: string[];
  role: string;
  text: string;
  attributes: Record<string, string>;
}

export class DOMCollector {
  private readonly logger = createLogger('DOMCollector');

  async collectElements(page: Page, scope?: string): Promise<ElementNode[]> {
    this.logger.info('Collecting DOM elements', { scope });
    const selector = scope ?? INTERACTIVE_TAGS.join(', ');

    const rawElements = await page.evaluate((sel: string) => {
      const elements = Array.from(document.querySelectorAll(sel));
      return elements.map((el) => {
        const elem = el as Element;
        const attrs: Record<string, string> = {};
        for (const attr of Array.from(elem.attributes)) {
          attrs[attr.name] = attr.value;
        }
        return {
          tag: elem.tagName.toLowerCase(),
          id: (elem as HTMLElement).id,
          classes: Array.from(elem.classList) as string[],
          role: elem.getAttribute('role') ?? '',
          text: (elem as HTMLElement).innerText?.slice(0, 200) ?? '',
          attributes: attrs,
        };
      });
    }, selector);

    return rawElements.map((raw: RawElement) => this.toElementNode(raw));
  }

  private toElementNode(raw: RawElement): ElementNode {
    const elementId = generateId(`${raw.tag}-${raw.id}-${raw.text}-${JSON.stringify(raw.attributes)}`);
    return {
      elementId,
      tag: raw.tag,
      role: raw.role || undefined,
      text: raw.text || undefined,
      attributes: { ...raw.attributes, id: raw.id, class: raw.classes.join(' ') },
      locators: [],
      framePath: [],
    };
  }
}
