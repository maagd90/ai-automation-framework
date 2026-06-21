import type { ActionType, TestStep } from '@ai-agent/shared-types';
import { ACTION_TYPES } from '@ai-agent/shared-types';

export type NormalizationConfidence = 'high' | 'medium' | 'low';

export interface NormalizedIntent {
  action: ActionType;
  target?: string;
  value?: string;
  expected?: string;
  confidence: NormalizationConfidence;
  sourceText: string;
}

const VALID_ACTIONS = new Set<string>(ACTION_TYPES);

export class StepNormalizer {
  analyze(stepText: string): NormalizedIntent {
    const text = stepText.trim();

    const enterMatch = text.match(/^(?:enter|type|fill|input)\s+"([^"]+)"\s+(?:into|in|in the)\s+(.+)$/i);
    if (enterMatch) {
      return {
        action: 'enter',
        value: enterMatch[1],
        target: enterMatch[2].trim(),
        confidence: 'high',
        sourceText: text,
      };
    }

    const enterUnquoted = text.match(/^(?:enter|type|fill|input)\s+(\S+)\s+(?:into|in|in the)\s+(.+)$/i);
    if (enterUnquoted) {
      return {
        action: 'enter',
        value: enterUnquoted[1],
        target: enterUnquoted[2].trim(),
        confidence: 'medium',
        sourceText: text,
      };
    }

    const clickMatch = text.match(/^(?:click|press|tap)\s+(?:the\s+)?(.+)$/i);
    if (clickMatch) {
      return {
        action: 'click',
        target: clickMatch[1].trim(),
        confidence: 'high',
        sourceText: text,
      };
    }

    const selectMatch = text.match(/^select\s+"([^"]+)"\s+from\s+(.+)$/i);
    if (selectMatch) {
      return {
        action: 'select',
        value: selectMatch[1],
        target: selectMatch[2].trim(),
        confidence: 'high',
        sourceText: text,
      };
    }

    const checkMatch = text.match(/^check\s+(?:the\s+)?(.+)$/i);
    if (checkMatch) {
      return {
        action: 'check',
        target: checkMatch[1].trim(),
        confidence: 'high',
        sourceText: text,
      };
    }

    const uncheckMatch = text.match(/^uncheck\s+(?:the\s+)?(.+)$/i);
    if (uncheckMatch) {
      return {
        action: 'uncheck',
        target: uncheckMatch[1].trim(),
        confidence: 'high',
        sourceText: text,
      };
    }

    const verifyVisibleMatch = text.match(
      /^(?:verify|assert|expect|check that)\s+(.+)\s+(?:is\s+)?(?:visible|displayed|shown)$/i,
    );
    if (verifyVisibleMatch) {
      return {
        action: 'verifyVisible',
        target: verifyVisibleMatch[1].trim(),
        confidence: 'high',
        sourceText: text,
      };
    }

    const verifyTextMatch = text.match(/^verify(?:\s+text)?\s+"([^"]+)"\s+(?:in|on|at)\s+(.+)$/i);
    if (verifyTextMatch) {
      return {
        action: 'verifyText',
        value: verifyTextMatch[1],
        target: verifyTextMatch[2].trim(),
        confidence: 'high',
        sourceText: text,
      };
    }

    const navigateMatch = text.match(/^(?:navigate|go)\s+to\s+(.+)$/i);
    if (navigateMatch) {
      return {
        action: 'navigate',
        target: navigateMatch[1].trim(),
        confidence: 'high',
        sourceText: text,
      };
    }

    const gherkinStrip = text.replace(/^(?:Given|When|Then|And|But)\s+/i, '').trim();
    if (gherkinStrip !== text) {
      const inner = this.analyze(gherkinStrip);
      return { ...inner, confidence: inner.confidence === 'high' ? 'medium' : 'low', sourceText: text };
    }

    const isAmbiguous =
      text.length > 40 ||
      /\b(verify|should|expect|complete|login flow)\b/i.test(text);

    return {
      action: 'click',
      target: text,
      confidence: isAmbiguous ? 'low' : 'medium',
      sourceText: text,
    };
  }

  needsNormalization(step: TestStep): boolean {
    const action = step.action?.trim() ?? '';
    if (!action) return true;
    if (!VALID_ACTIONS.has(action)) return true;
    if (step.description?.trim() && !VALID_ACTIONS.has(action)) return true;
    return false;
  }

  normalizeStep(step: TestStep): TestStep & { inferred?: boolean; confidence?: NormalizationConfidence } {
    const action = step.action?.trim() ?? '';
    const description = step.description?.trim();

    if (action && VALID_ACTIONS.has(action)) {
      return {
        ...step,
        action: action as ActionType,
        description: description ?? undefined,
        inferred: false,
        confidence: 'high',
      };
    }

    const sourceText = description || action || step.target || '';
    if (!sourceText.trim()) {
      return { ...step, action: action || '', inferred: false };
    }

    const intent = this.analyze(sourceText);
    return {
      order: step.order,
      action: intent.action,
      target: intent.target ?? step.target,
      value: intent.value ?? step.value,
      expected: step.expected,
      description: description || sourceText,
      inferred: true,
      confidence: intent.confidence,
    };
  }
}

export const stepNormalizer = new StepNormalizer();
