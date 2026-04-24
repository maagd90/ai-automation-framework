import type { Page } from 'playwright';
import type { ElementNode } from '../domain/ElementNode.js';
import { Logger } from '../../utils/Logger.js';

const INTERACTIVE_SELECTOR =
  'input, button, select, textarea, a[href], [role], [data-testid]';

export class DomInspector {
  private readonly logger = new Logger('DomInspector');

  constructor(private readonly page: Page) {}

  async collectElements(): Promise<ElementNode[]> {
    this.logger.info('Collecting interactive elements from DOM');

    const elements = await this.page.evaluate((selector: string): ElementNode[] => {
      interface ElementNode {
        tagName: string;
        text: string;
        id?: string;
        name?: string;
        type?: string;
        placeholder?: string;
        ariaLabel?: string;
        role?: string;
        dataTestId?: string;
        className?: string;
        href?: string;
        visible: boolean;
        enabled: boolean;
        boundingBox?: { x: number; y: number; width: number; height: number };
      }

      const nodes = Array.from(document.querySelectorAll(selector));
      return nodes.map((el): ElementNode => {
        const htmlEl = el as HTMLElement;
        const inputEl = el as HTMLInputElement;
        const anchorEl = el as HTMLAnchorElement;
        const rect = htmlEl.getBoundingClientRect();

        return {
          tagName: htmlEl.tagName.toLowerCase(),
          text: htmlEl.textContent?.trim() ?? '',
          id: htmlEl.id || undefined,
          name: inputEl.name || undefined,
          type: inputEl.type || undefined,
          placeholder: inputEl.placeholder || undefined,
          ariaLabel: htmlEl.getAttribute('aria-label') ?? undefined,
          role: htmlEl.getAttribute('role') ?? undefined,
          dataTestId: htmlEl.getAttribute('data-testid') ?? undefined,
          className: htmlEl.className || undefined,
          href: anchorEl.href || undefined,
          visible: htmlEl.offsetParent !== null,
          enabled: !inputEl.disabled,
          boundingBox: rect.width > 0
            ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
            : undefined,
        };
      });
    }, INTERACTIVE_SELECTOR);

    this.logger.info(`Collected ${elements.length} elements`);
    return elements;
  }
}
