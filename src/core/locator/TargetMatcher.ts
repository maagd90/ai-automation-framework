import type { ActionType } from '../domain/TestStep.js';
import type { ElementNode } from '../domain/ElementNode.js';
import { StringUtils } from '../../utils/StringUtils.js';

export interface TargetMatchResult {
  element: ElementNode;
  confidence: number;
  diagnostics: string[];
}

export class TargetMatcher {
  constructor(private readonly threshold = 60) {}

  match(target: string, elements: ElementNode[], action?: ActionType): TargetMatchResult | null {
    const normalized = StringUtils.normalize(target);
    const ranked = elements
      .map((element) => this.score(normalized, action, element))
      .sort((a, b) => b.confidence - a.confidence);

    const best = ranked[0];
    if (!best || best.confidence < this.threshold) {
      return null;
    }

    return best;
  }

  private score(
    target: string,
    action: ActionType | undefined,
    element: ElementNode,
  ): TargetMatchResult {
    let confidence = 0;
    const diagnostics: string[] = [];

    confidence += this.scoreField(target, element.associatedLabel, 35, 20, 'associated label', diagnostics);
    confidence += this.scoreField(target, element.placeholder, 28, 16, 'placeholder', diagnostics);
    confidence += this.scoreField(target, element.dataTestId, 24, 14, 'data-testid', diagnostics);
    confidence += this.scoreField(target, element.name, 18, 10, 'name', diagnostics);
    confidence += this.scoreField(target, element.id, 18, 10, 'id', diagnostics);
    confidence += this.scoreField(target, element.ariaLabel, 24, 14, 'aria-label', diagnostics);
    confidence += this.scoreField(target, element.accessibleName, 30, 18, 'accessible name', diagnostics);
    confidence += this.scoreField(target, element.text, 22, 12, 'visible text', diagnostics);
    confidence += this.scoreField(target, element.parentContext, 8, 4, 'parent context', diagnostics);
    confidence += this.scoreField(target, element.siblingContext, 8, 4, 'sibling context', diagnostics);

    if (this.isRoleCompatible(target, element)) {
      confidence += 8;
      diagnostics.push('role compatible');
    }

    if (this.isActionCompatible(action, element)) {
      confidence += 12;
      diagnostics.push('action compatible');
    }

    if (element.visible) {
      confidence += 6;
      diagnostics.push('visible');
    } else {
      confidence -= 25;
      diagnostics.push('not visible');
    }

    if (element.enabled || action === 'verifyText' || action === 'verifyVisible') {
      confidence += 4;
      diagnostics.push(element.enabled ? 'enabled' : 'disabled but assertion-only action');
    } else {
      confidence -= 20;
      diagnostics.push('disabled');
    }

    return {
      element,
      confidence: Math.max(0, Math.min(100, confidence)),
      diagnostics,
    };
  }

  private scoreField(
    target: string,
    value: string | undefined,
    exactPoints: number,
    fuzzyPoints: number,
    label: string,
    diagnostics: string[],
  ): number {
    if (!value) return 0;

    const normalized = StringUtils.normalize(value);
    if (!normalized) return 0;

    if (normalized === target) {
      diagnostics.push(`${label}: exact match`);
      return exactPoints;
    }

    if (normalized.includes(target) || target.includes(normalized)) {
      diagnostics.push(`${label}: partial match`);
      return fuzzyPoints;
    }

    const similarity = StringUtils.similarity(target, normalized);
    if (similarity >= 55) {
      diagnostics.push(`${label}: similarity ${similarity}`);
      return Math.round((fuzzyPoints * similarity) / 100);
    }

    return 0;
  }

  private isRoleCompatible(target: string, element: ElementNode): boolean {
    const role = StringUtils.normalize(element.role ?? element.inferredRole ?? element.tagName);
    if (!role) return false;

    const roleHints: Array<[RegExp, string[]]> = [
      [/\b(button|submit|save|login|sign in)\b/, ['button']],
      [/\b(link)\b/, ['link']],
      [/\b(email|username|password|search|input|field|textbox)\b/, ['textbox']],
      [/\b(dropdown|select|option)\b/, ['combobox']],
      [/\bcheckbox|toggle\b/, ['checkbox']],
      [/\bradio\b/, ['radio']],
    ];

    return roleHints.some(([pattern, roles]) => pattern.test(target) && roles.includes(role));
  }

  private isActionCompatible(action: ActionType | undefined, element: ElementNode): boolean {
    const role = element.role ?? element.inferredRole ?? element.tagName;
    const type = element.type ?? '';

    switch (action) {
      case 'enter':
        return ['input', 'textarea'].includes(element.tagName) || ['textbox', 'searchbox'].includes(role);
      case 'select':
        return element.tagName === 'select' || ['combobox', 'listbox'].includes(role);
      case 'check':
      case 'uncheck':
        return ['checkbox', 'radio', 'switch'].includes(role) || ['checkbox', 'radio'].includes(type);
      case 'click':
        return ['button', 'link'].includes(role) || ['button', 'a'].includes(element.tagName);
      case 'verifyText':
      case 'verifyVisible':
      case 'navigate':
      default:
        return true;
    }
  }
}
