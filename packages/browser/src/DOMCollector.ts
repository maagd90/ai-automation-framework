import { Page } from 'playwright';
import { ElementNode } from '@locator-agent/core';
import { Logger } from '@locator-agent/shared';

const INTERACTIVE_SELECTOR = 'button, input, a, select, textarea, [role], label, [data-testid], [data-test], [data-cy]';

export class DOMCollector {
  private readonly logger = new Logger('DOMCollector');

  async collect(page: Page): Promise<ElementNode[]> {
    this.logger.info('Collecting DOM elements');
    const elements = await page.$$(INTERACTIVE_SELECTOR);
    const nodes: ElementNode[] = [];

    for (const el of elements) {
      try {
        const node = await el.evaluate((domEl: Element): ElementNode => {
          const htmlEl = domEl as HTMLElement;
          const attrs: Record<string, string> = {};
          for (const attr of Array.from(htmlEl.attributes)) {
            attrs[attr.name] = attr.value;
          }
          return {
            tag: htmlEl.tagName.toLowerCase(),
            id: htmlEl.id || undefined,
            role: htmlEl.getAttribute('role') || undefined,
            text: htmlEl.textContent?.trim() || undefined,
            name: (htmlEl as HTMLInputElement).name || undefined,
            placeholder: (htmlEl as HTMLInputElement).placeholder || undefined,
            type: (htmlEl as HTMLInputElement).type || undefined,
            href: (htmlEl as HTMLAnchorElement).href || undefined,
            ariaLabel: htmlEl.getAttribute('aria-label') || undefined,
            attributes: attrs,
            framePath: [],
          };
        });
        nodes.push(node);
      } catch {
        // skip elements that can't be evaluated
      }
    }

    return nodes;
  }
}
