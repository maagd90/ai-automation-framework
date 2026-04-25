import type { Page } from 'playwright';
import type { ElementNode } from '../domain/ElementNode.js';
import { Logger } from '../../utils/Logger.js';

const INTERACTIVE_SELECTOR =
  'input, button, select, textarea, a[href], [role], [data-testid], label';

export class DomInspector {
  private readonly logger = new Logger('DomInspector');

  constructor(private readonly page: Page) {}

  async collectElements(): Promise<ElementNode[]> {
    this.logger.info('Collecting interactive elements from DOM');

    const elements = await this.page.evaluate((selector: string): ElementNode[] => {
      const getText = (node: Element | null): string =>
        node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

      const inferRole = (el: HTMLElement): string | undefined => {
        if (el.getAttribute('role')) return undefined;
        const tagName = el.tagName.toLowerCase();

        if (tagName === 'button') return 'button';
        if (tagName === 'a' && (el as HTMLAnchorElement).href) return 'link';
        if (tagName === 'select') return 'combobox';
        if (tagName === 'textarea') return 'textbox';
        if (tagName !== 'input') return undefined;

        const input = el as HTMLInputElement;
        switch (input.type) {
          case 'button':
          case 'submit':
          case 'reset':
            return 'button';
          case 'checkbox':
            return 'checkbox';
          case 'radio':
            return 'radio';
          default:
            return 'textbox';
        }
      };

      const getAssociatedLabel = (el: HTMLElement): string | undefined => {
        const labels = new Set<string>();

        if (el.id) {
          document.querySelectorAll('label').forEach((label) => {
            const htmlLabel = label as HTMLLabelElement;
            if (htmlLabel.htmlFor === el.id) {
              const text = getText(htmlLabel);
              if (text) labels.add(text);
            }
          });
        }

        const wrappingLabel = el.closest('label');
        const wrappingText = getText(wrappingLabel);
        if (wrappingText) labels.add(wrappingText);

        const combined = Array.from(labels).join(' | ').trim();
        return combined || undefined;
      };

      const getAriaLabelledByText = (el: HTMLElement): string | undefined => {
        const labelledBy = el.getAttribute('aria-labelledby');
        if (!labelledBy) return undefined;

        const text = labelledBy
          .split(/\s+/)
          .map((id) => getText(document.getElementById(id)))
          .filter(Boolean)
          .join(' ')
          .trim();

        return text || undefined;
      };

      const getAccessibleName = (el: HTMLElement, associatedLabel?: string): string | undefined => {
        const ariaLabel = el.getAttribute('aria-label')?.trim();
        const labelledByText = getAriaLabelledByText(el);
        const title = el.getAttribute('title')?.trim();
        const placeholder = (el as HTMLInputElement).placeholder?.trim();
        const text = getText(el);

        return ariaLabel || labelledByText || associatedLabel || title || placeholder || text || undefined;
      };

      const getSiblingContext = (el: HTMLElement): string | undefined => {
        const siblingTexts = [el.previousElementSibling, el.nextElementSibling]
          .map((node) => getText(node))
          .filter(Boolean)
          .join(' | ')
          .trim();

        return siblingTexts || undefined;
      };

      const nodes = Array.from(document.querySelectorAll(selector)).filter(
        (el) => el.tagName.toLowerCase() !== 'label',
      );

      return nodes.map((el): ElementNode => {
        const htmlEl = el as HTMLElement;
        const inputEl = el as HTMLInputElement;
        const anchorEl = el as HTMLAnchorElement;
        const rect = htmlEl.getBoundingClientRect();
        const associatedLabel = getAssociatedLabel(htmlEl);
        const inferredRole = inferRole(htmlEl);

        return {
          tagName: htmlEl.tagName.toLowerCase(),
          text: getText(htmlEl),
          id: htmlEl.id || undefined,
          name: inputEl.name || undefined,
          type: inputEl.type || undefined,
          placeholder: inputEl.placeholder || undefined,
          associatedLabel,
          accessibleName: getAccessibleName(htmlEl, associatedLabel),
          ariaLabel: htmlEl.getAttribute('aria-label') ?? undefined,
          role: htmlEl.getAttribute('role') ?? undefined,
          inferredRole,
          dataTestId: htmlEl.getAttribute('data-testid') ?? undefined,
          className: htmlEl.className || undefined,
          href: anchorEl.href || undefined,
          parentContext: getText(htmlEl.parentElement),
          siblingContext: getSiblingContext(htmlEl),
          visible: htmlEl.offsetParent !== null,
          enabled:
            'disabled' in inputEl
              ? !Boolean(
                  (
                    inputEl as HTMLInputElement &
                      HTMLButtonElement &
                      HTMLSelectElement &
                      HTMLTextAreaElement
                  ).disabled,
                )
              : true,
          boundingBox:
            rect.width > 0
              ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
              : undefined,
        };
      });
    }, INTERACTIVE_SELECTOR);

    this.logger.info(`Collected ${elements.length} elements`);
    return elements;
  }
}
