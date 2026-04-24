import type { ElementNode } from '../domain/ElementNode.js';
import { StringUtils } from '../../utils/StringUtils.js';

export class TargetMatcher {
  match(target: string, elements: ElementNode[]): ElementNode | null {
    const normalized = StringUtils.normalize(target);

    for (const el of elements) {
      if (this.score(normalized, el) >= 90) return el;
    }

    let best: { el: ElementNode; score: number } | null = null;
    for (const el of elements) {
      const s = this.score(normalized, el);
      if (!best || s > best.score) {
        best = { el, score: s };
      }
    }

    return best && best.score >= 40 ? best.el : null;
  }

  private score(target: string, el: ElementNode): number {
    const fields = [
      el.ariaLabel,
      el.placeholder,
      el.name,
      el.id,
      el.dataTestId,
      el.text,
    ].filter((f): f is string => typeof f === 'string');

    let max = 0;
    for (const field of fields) {
      const n = StringUtils.normalize(field);
      if (n === target) { max = 100; break; }
      if (n.includes(target) || target.includes(n)) {
        max = Math.max(max, 80);
      }
      const sim = StringUtils.similarity(target, n);
      max = Math.max(max, sim);
    }
    return max;
  }
}
