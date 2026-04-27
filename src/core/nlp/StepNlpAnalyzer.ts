import type { ActionType } from '../domain/TestStep.js';

export interface NlpStepResult {
  action: ActionType;
  target: string;
  value?: string;
  expected?: string;
  confidence: number;
  source: 'nlp-rule';
}

export const NLP_CONFIDENCE_THRESHOLD = 0.70;

/**
 * Rule-based NLP analyzer for the root-level CLI agent.
 * Returns structured step data with confidence scoring.
 */
export class StepNlpAnalyzer {
  analyze(stepText: string): NlpStepResult {
    const text = stepText.trim();

    // ── Enter / type / fill ─────────────────────────────────────────────────
    const enterKw = /^(?:enter|type|fill|input|write)\s+(.+)/i.exec(text);
    if (enterKw) {
      const rest = enterKw[1];
      const quotedValue = /^"([^"]+)"\s+(?:into|in|in the|on)\s+(.+)$/i.exec(rest);
      if (quotedValue) {
        return { action: 'enter', target: quotedValue[2].trim(), value: quotedValue[1], confidence: 0.95, source: 'nlp-rule' };
      }
      const intoForm = /^(\S+)\s+(?:into|in|in the|on)\s+(.+)$/i.exec(rest);
      if (intoForm) {
        return { action: 'enter', target: intoForm[2].trim(), value: intoForm[1], confidence: 0.90, source: 'nlp-rule' };
      }
      const words = rest.split(/\s+/);
      if (words.length >= 2) {
        return { action: 'enter', target: words.slice(0, -1).join(' '), value: words[words.length - 1], confidence: 0.80, source: 'nlp-rule' };
      }
      return { action: 'enter', target: rest, confidence: 0.75, source: 'nlp-rule' };
    }

    // ── Click / press / tap ─────────────────────────────────────────────────
    const clickKw = /^(?:click|press|tap)\s+(?:on\s+)?(?:the\s+)?(.+)$/i.exec(text);
    if (clickKw) {
      return { action: 'click', target: clickKw[1].trim(), confidence: 0.92, source: 'nlp-rule' };
    }

    // ── Select / choose ─────────────────────────────────────────────────────
    const selectKw = /^(?:select|choose)\s+(.+?)\s+from\s+(.+)$/i.exec(text);
    if (selectKw) {
      return { action: 'select', target: selectKw[2].trim(), value: selectKw[1].replace(/^["']|["']$/g, '').trim(), confidence: 0.92, source: 'nlp-rule' };
    }
    const selectSimple = /^(?:select|choose)\s+(.+)$/i.exec(text);
    if (selectSimple) {
      return { action: 'select', target: selectSimple[1].trim(), confidence: 0.75, source: 'nlp-rule' };
    }

    // ── Uncheck ─────────────────────────────────────────────────────────────
    const uncheckKw = /^(?:uncheck|untick)\s+(?:the\s+)?(.+)$/i.exec(text);
    if (uncheckKw) {
      return { action: 'uncheck', target: uncheckKw[1].trim(), confidence: 0.90, source: 'nlp-rule' };
    }

    // ── Check / tick ────────────────────────────────────────────────────────
    const checkKw = /^(?:check|tick)\s+(?:the\s+)?(.+)$/i.exec(text);
    if (checkKw) {
      return { action: 'check', target: checkKw[1].trim(), confidence: 0.88, source: 'nlp-rule' };
    }

    // ── Navigate ────────────────────────────────────────────────────────────
    const navigateKw = /^(?:navigate|go|open)\s+(?:to\s+)?(.+)$/i.exec(text);
    if (navigateKw) {
      return { action: 'navigate', target: navigateKw[1].trim(), confidence: 0.90, source: 'nlp-rule' };
    }

    // ── Verify URL / redirect ────────────────────────────────────────────────
    const redirectKw = /(?:should\s+be\s+redirected?\s+to|is\s+redirected?\s+to|url\s+should\s+be|navigated?\s+to)\s+(.+)/i.exec(text);
    if (redirectKw) {
      return { action: 'verifyUrl', target: redirectKw[1].trim(), expected: text, confidence: 0.85, source: 'nlp-rule' };
    }

    // ── Verify text ─────────────────────────────────────────────────────────
    const verifyTextKw = /^(?:verify|assert|check|should\s+(?:see|contain|display|have))\s+(?:text\s+)?["']?([^"']+)["']?\s+(?:in|on|at|for)\s+(.+)$/i.exec(text);
    if (verifyTextKw) {
      return { action: 'verifyText', target: verifyTextKw[2].trim(), value: verifyTextKw[1].trim(), expected: text, confidence: 0.88, source: 'nlp-rule' };
    }

    // ── Verify visible ──────────────────────────────────────────────────────
    const verifyVisibleKw = /^(?:verify|assert|check|validate|should\s+see)\s+(?:that\s+)?(.+?)\s+(?:is\s+)?(?:visible|displayed|shown|present|appears)$/i.exec(text);
    if (verifyVisibleKw) {
      return { action: 'verifyVisible', target: verifyVisibleKw[1].trim(), expected: text, confidence: 0.88, source: 'nlp-rule' };
    }

    const shouldKw = /^(?:(?:the\s+)?(.+?)\s+should\s+(?:be\s+)?(?:visible|displayed|shown|present))$/i.exec(text);
    if (shouldKw) {
      return { action: 'verifyVisible', target: shouldKw[1].trim(), expected: text, confidence: 0.80, source: 'nlp-rule' };
    }

    return { action: 'click', target: text, confidence: 0.40, source: 'nlp-rule' };
  }
}
