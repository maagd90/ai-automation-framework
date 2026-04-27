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

/** Maximum step text length to prevent ReDoS attacks. */
const MAX_STEP_LENGTH = 500;

/**
 * Rule-based NLP analyzer for the root-level CLI agent.
 * Returns structured step data with confidence scoring.
 */
export class StepNlpAnalyzer {
  analyze(stepText: string): NlpStepResult {
    if (stepText.length > MAX_STEP_LENGTH) {
      return { action: 'click', target: stepText.slice(0, 100), confidence: 0.30, source: 'nlp-rule' };
    }

    const text = stepText.trim();
    const lowerText = text.toLowerCase();

    // ── Enter / type / fill ─────────────────────────────────────────────────
    const enterKw = /^(?:enter|type|fill|input|write) (.+)/i.exec(text);
    if (enterKw) {
      const rest = enterKw[1];
      const quotedValue = /^"([^"]+)" (?:into?(?:(?: the)?)?|on) (.+)$/i.exec(rest);
      if (quotedValue) {
        return { action: 'enter', target: quotedValue[2].trim(), value: quotedValue[1], confidence: 0.95, source: 'nlp-rule' };
      }
      const intoForm = /^(\S+) (?:into?(?:(?: the)?)?|on) (.+)$/i.exec(rest);
      if (intoForm) {
        return { action: 'enter', target: intoForm[2].trim(), value: intoForm[1], confidence: 0.90, source: 'nlp-rule' };
      }
      const spaceIdx = rest.lastIndexOf(' ');
      if (spaceIdx > 0) {
        return { action: 'enter', target: rest.slice(0, spaceIdx), value: rest.slice(spaceIdx + 1), confidence: 0.80, source: 'nlp-rule' };
      }
      return { action: 'enter', target: rest, confidence: 0.75, source: 'nlp-rule' };
    }

    // ── Click / press / tap ─────────────────────────────────────────────────
    const clickKw = /^(?:click|press|tap) (.+)$/i.exec(text);
    if (clickKw) {
      const target = clickKw[1].replace(/^(?:on |the |on the )/i, '').trim();
      return { action: 'click', target, confidence: 0.92, source: 'nlp-rule' };
    }

    // ── Select / choose ─────────────────────────────────────────────────────
    const selectPrefix = /^(?:select|choose) /i.exec(text);
    if (selectPrefix) {
      const rest = text.slice(selectPrefix[0].length);
      const fromIdx = rest.toLowerCase().lastIndexOf(' from ');
      if (fromIdx > 0) {
        const value = rest.slice(0, fromIdx).replace(/^["']|["']$/g, '').trim();
        const target = rest.slice(fromIdx + 6).trim();
        return { action: 'select', target, value, confidence: 0.92, source: 'nlp-rule' };
      }
      return { action: 'select', target: rest.trim(), confidence: 0.75, source: 'nlp-rule' };
    }

    // ── Uncheck ─────────────────────────────────────────────────────────────
    const uncheckKw = /^(?:uncheck|untick) (?:the )?(.+)$/i.exec(text);
    if (uncheckKw) {
      return { action: 'uncheck', target: uncheckKw[1].trim(), confidence: 0.90, source: 'nlp-rule' };
    }

    // ── Check / tick ────────────────────────────────────────────────────────
    const tickKw = /^tick (?:the )?(.+)$/i.exec(text);
    if (tickKw) {
      return { action: 'check', target: tickKw[1].trim(), confidence: 0.88, source: 'nlp-rule' };
    }

    // ── Navigate ────────────────────────────────────────────────────────────
    const navigateKw = /^(?:navigate|go|open) (?:to )?(.+)$/i.exec(text);
    if (navigateKw) {
      return { action: 'navigate', target: navigateKw[1].trim(), confidence: 0.90, source: 'nlp-rule' };
    }

    // ── Verify URL / redirect ────────────────────────────────────────────────
    const redirectPhrases = ['should be redirected to', 'is redirected to', 'url should be', 'navigated to'];
    for (const phrase of redirectPhrases) {
      const idx = lowerText.indexOf(phrase);
      if (idx !== -1) {
        const target = text.slice(idx + phrase.length).trim();
        return { action: 'verifyUrl', target, expected: text, confidence: 0.85, source: 'nlp-rule' };
      }
    }

    // ── Verify text ─────────────────────────────────────────────────────────
    const verifyTextPrefix = /^(?:verify|assert|should (?:see|contain|display|have)) (?:text )?/i.exec(text);
    if (verifyTextPrefix) {
      const rest = text.slice(verifyTextPrefix[0].length);
      const sepMatch = / (?:in|on|at|for) /i.exec(rest);
      if (sepMatch) {
        const value = rest.slice(0, sepMatch.index).replace(/^["']|["']$/g, '').trim();
        const target = rest.slice(sepMatch.index + sepMatch[0].length).trim();
        return { action: 'verifyText', target, value, expected: text, confidence: 0.88, source: 'nlp-rule' };
      }
    }

    // ── Verify visible ──────────────────────────────────────────────────────
    const visibilityEndings = ['is visible', 'is displayed', 'is shown', 'is present', 'appears', 'should be visible', 'should be displayed'];
    const verifyPrefixes = ['verify ', 'assert ', 'check ', 'validate ', 'should see '];
    for (const vp of verifyPrefixes) {
      if (lowerText.startsWith(vp)) {
        const rest = text.slice(vp.length).replace(/^that /i, '');
        for (const ending of visibilityEndings) {
          if (rest.toLowerCase().endsWith(' ' + ending)) {
            const target = rest.slice(0, rest.length - ending.length - 1).trim();
            return { action: 'verifyVisible', target, expected: text, confidence: 0.88, source: 'nlp-rule' };
          }
        }
        return { action: 'verifyVisible', target: rest.trim(), expected: text, confidence: 0.75, source: 'nlp-rule' };
      }
    }

    // ── Should be visible ───────────────────────────────────────────────────
    const shouldIdx = lowerText.indexOf(' should be ');
    if (shouldIdx > 0) {
      const target = text.slice(0, shouldIdx).replace(/^the /i, '').trim();
      const assertion = lowerText.slice(shouldIdx + 11);
      if (['visible', 'displayed', 'shown', 'present'].includes(assertion.trim())) {
        return { action: 'verifyVisible', target, expected: text, confidence: 0.80, source: 'nlp-rule' };
      }
    }

    return { action: 'click', target: text, confidence: 0.40, source: 'nlp-rule' };
  }
}
