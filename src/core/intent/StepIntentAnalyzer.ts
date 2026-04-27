import type { ActionType } from '../domain/TestStep.js';

export interface StepIntent {
  action: ActionType;
  target: string;
  value?: string;
}

export class StepIntentAnalyzer {
  analyze(stepText: string): StepIntent {
    const text = stepText.trim();

    const enterMatch = text.match(/^(?:enter|type|fill|input)\s+"([^"]+)"\s+(?:into|in|in the)\s+(.+)$/i);
    if (enterMatch) {
      return { action: 'enter', value: enterMatch[1], target: enterMatch[2].trim() };
    }

    const clickMatch = text.match(/^(?:click|press|tap)\s+(?:the\s+)?(.+)$/i);
    if (clickMatch) {
      return { action: 'click', target: clickMatch[1].trim() };
    }

    const selectMatch = text.match(/^select\s+"([^"]+)"\s+from\s+(.+)$/i);
    if (selectMatch) {
      return { action: 'select', value: selectMatch[1], target: selectMatch[2].trim() };
    }

    const checkMatch = text.match(/^check\s+(?:the\s+)?(.+)$/i);
    if (checkMatch) {
      return { action: 'check', target: checkMatch[1].trim() };
    }

    const uncheckMatch = text.match(/^uncheck\s+(?:the\s+)?(.+)$/i);
    if (uncheckMatch) {
      return { action: 'uncheck', target: uncheckMatch[1].trim() };
    }

    const verifyVisibleMatch = text.match(/^(?:verify|assert|expect|check that)\s+(.+)\s+(?:is\s+)?(?:visible|displayed|shown)$/i);
    if (verifyVisibleMatch) {
      return { action: 'verifyVisible', target: verifyVisibleMatch[1].trim() };
    }

    const verifyTextMatch = text.match(/^verify(?:\s+text)?\s+"([^"]+)"\s+(?:in|on|at)\s+(.+)$/i);
    if (verifyTextMatch) {
      return { action: 'verifyText', value: verifyTextMatch[1], target: verifyTextMatch[2].trim() };
    }

    const navigateMatch = text.match(/^(?:navigate|go)\s+to\s+(.+)$/i);
    if (navigateMatch) {
      return { action: 'navigate', target: navigateMatch[1].trim() };
    }

    const redirectMatch = text.match(/^(?:should\s+be\s+redirected?\s+to|is\s+redirected?\s+to|url\s+should\s+be)\s+(.+)$/i);
    if (redirectMatch) {
      return { action: 'verifyUrl', target: redirectMatch[1].trim() };
    }

    return { action: 'click', target: text };
  }
}
