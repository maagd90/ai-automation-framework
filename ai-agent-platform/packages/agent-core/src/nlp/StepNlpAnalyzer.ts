/**
 * Rule-based NLP analyzer for converting natural language test steps
 * into structured automation actions with confidence scoring.
 *
 * AI fallback is invoked only when confidence < NLP_CONFIDENCE_THRESHOLD.
 */

export type NlpActionType =
  | 'enter'
  | 'click'
  | 'select'
  | 'check'
  | 'uncheck'
  | 'verifyVisible'
  | 'verifyText'
  | 'verifyUrl'
  | 'navigate';

export type NlpSource = 'explicit-column' | 'nlp-rule' | 'ai-fallback';

export interface NlpResult {
  action: NlpActionType;
  target: string;
  value?: string;
  expected?: string;
  confidence: number;
  source: NlpSource;
}

export const NLP_CONFIDENCE_THRESHOLD = 0.70;

/** Maximum step text length accepted by the NLP analyzer to prevent ReDoS. */
const MAX_STEP_LENGTH = 500;

/** Normalise a raw Action column value to a canonical action type. */
export function normalizeActionColumn(raw: string): NlpActionType | null {
  const v = raw.trim().toLowerCase();
  if (/^(input|type|fill|enter|write)$/.test(v)) return 'enter';
  if (/^(press|click|tap)$/.test(v)) return 'click';
  if (/^(choose|dropdown|select)$/.test(v)) return 'select';
  if (/^(validate|assert|check|verify|verifyvisible|verifytext)$/.test(v)) {
    return 'verifyVisible';
  }
  if (/^(should see)$/.test(v)) return 'verifyVisible';
  if (/^(untick|uncheck)$/.test(v)) return 'uncheck';
  if (/^(tick)$/.test(v)) return 'check';
  if (/^(navigate|go|open|verifyurl)$/.test(v)) return 'navigate';
  return null;
}

/**
 * Pure rule-based NLP analyzer.
 * Returns an NlpResult; confidence < NLP_CONFIDENCE_THRESHOLD signals fallback.
 */
export class StepNlpAnalyzer {
  analyze(stepText: string): NlpResult {
    // Guard against ReDoS from excessively long inputs
    if (stepText.length > MAX_STEP_LENGTH) {
      return { action: 'click', target: stepText.slice(0, 100), confidence: 0.30, source: 'nlp-rule' };
    }

    const text = stepText.trim();

    // ── Enter / type / fill ─────────────────────────────────────────────────
    const enterKw = /^(?:enter|type|fill|input|write) (.+)/i.exec(text);
    if (enterKw) {
      const rest = enterKw[1];
      // Try quoted value first: Enter "val" into target
      // Use non-backtracking literal "into/in/on" detection
      const quotedValue = /^"([^"]+)" (?:into?(?:(?: the)?)?|on) (.+)$/i.exec(rest);
      if (quotedValue) {
        return { action: 'enter', target: quotedValue[2].trim(), value: quotedValue[1], confidence: 0.95, source: 'nlp-rule' };
      }
      // Try "into/in" form: Enter username into Username field
      const intoForm = /^(\S+) (?:into?(?:(?: the)?)?|on) (.+)$/i.exec(rest);
      if (intoForm) {
        return { action: 'enter', target: intoForm[2].trim(), value: intoForm[1], confidence: 0.90, source: 'nlp-rule' };
      }
      // "Enter username standard_user" — last word is value
      const spaceIdx = rest.lastIndexOf(' ');
      if (spaceIdx > 0) {
        return { action: 'enter', target: rest.slice(0, spaceIdx), value: rest.slice(spaceIdx + 1), confidence: 0.80, source: 'nlp-rule' };
      }
      return { action: 'enter', target: rest, confidence: 0.75, source: 'nlp-rule' };
    }

    // ── Click / press / tap ─────────────────────────────────────────────────
    // Use non-capturing optional prefix words to avoid optional-group stacking
    const clickKw = /^(?:click|press|tap) (.+)$/i.exec(text);
    if (clickKw) {
      // Strip common leading articles to get clean target
      const target = clickKw[1].replace(/^(?:on |the |on the )/i, '').trim();
      return { action: 'click', target, confidence: 0.92, source: 'nlp-rule' };
    }

    // ── Select / choose / dropdown ──────────────────────────────────────────
    // Use indexOf-based split to avoid ReDoS with greedy patterns
    const selectPrefix = /^(?:select|choose) /i.exec(text);
    if (selectPrefix) {
      const rest = text.slice(selectPrefix[0].length);
      // Look for " from " separator — find LAST occurrence to handle "select X from Y from Z"
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
    const checkKw = /^(?:tick) (?:the )?(.+)$/i.exec(text);
    if (checkKw) {
      return { action: 'check', target: checkKw[1].trim(), confidence: 0.88, source: 'nlp-rule' };
    }
    // "check" handled below to avoid conflict with verifyVisible

    // ── Navigate / go / open ────────────────────────────────────────────────
    const navigateKw = /^(?:navigate|go|open) (?:to )?(.+)$/i.exec(text);
    if (navigateKw) {
      return { action: 'navigate', target: navigateKw[1].trim(), confidence: 0.90, source: 'nlp-rule' };
    }

    // ── URL redirect / navigation verification ──────────────────────────────
    // Use simple indexOf-based detection to avoid complex regex alternation
    const lowerText = text.toLowerCase();
    const redirectPhrases = ['should be redirected to', 'is redirected to', 'url should be', 'navigated to'];
    for (const phrase of redirectPhrases) {
      const idx = lowerText.indexOf(phrase);
      if (idx !== -1) {
        const target = text.slice(idx + phrase.length).trim();
        return { action: 'verifyUrl', target, expected: text, confidence: 0.85, source: 'nlp-rule' };
      }
    }

    // ── Verify text (explicit "in/on/at/for" separator) ─────────────────────
    // Split on " in | on | at | for " instead of complex regex
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
    // Check if text ends with visibility keyword
    // Note: 'check' is handled separately to avoid conflict with checkbox 'check' action
    const visibilityEndings = ['is visible', 'is displayed', 'is shown', 'is present', 'appears', 'should be visible', 'should be displayed'];
    const verifyPrefixes = ['verify ', 'assert ', 'validate ', 'should see '];
    for (const vp of verifyPrefixes) {
      if (lowerText.startsWith(vp)) {
        const rest = text.slice(vp.length).replace(/^that /i, '');
        for (const ending of visibilityEndings) {
          if (rest.toLowerCase().endsWith(' ' + ending)) {
            const target = rest.slice(0, rest.length - ending.length - 1).trim();
            return { action: 'verifyVisible', target, expected: text, confidence: 0.88, source: 'nlp-rule' };
          }
          if (rest.toLowerCase() === ending) {
            return { action: 'verifyVisible', target: rest, expected: text, confidence: 0.75, source: 'nlp-rule' };
          }
        }
        // Fallback: treat rest as target to verify
        return { action: 'verifyVisible', target: rest.trim(), expected: text, confidence: 0.75, source: 'nlp-rule' };
      }
    }

    // ── Check (disambiguated: verifyVisible vs checkbox tick) ────────────────
    const checkPrefix = /^check (?:the )?(.+)$/i.exec(text);
    if (checkPrefix) {
      const tgt = checkPrefix[1].trim();
      const tgtLower = tgt.toLowerCase();
      // If it starts with "that" or ends with a visibility keyword → treat as assertion
      const hasVisibilityEnding = visibilityEndings.some((e) => tgtLower.endsWith(' ' + e) || tgtLower === e);
      const startsWithThat = tgtLower.startsWith('that ');
      if (hasVisibilityEnding || startsWithThat) {
        const cleanTarget = startsWithThat ? tgt.slice(5) : tgt;
        return { action: 'verifyVisible', target: cleanTarget.trim(), expected: text, confidence: 0.85, source: 'nlp-rule' };
      }
      // Otherwise treat as a checkbox interaction
      return { action: 'check', target: tgt, confidence: 0.78, source: 'nlp-rule' };
    }

    // ── Fallback: "should" assertions ───────────────────────────────────────
    const shouldIdx = lowerText.indexOf(' should be ');
    if (shouldIdx > 0) {
      const target = text.slice(0, shouldIdx).replace(/^the /i, '').trim();
      const assertion = lowerText.slice(shouldIdx + 11);
      if (['visible', 'displayed', 'shown', 'present'].includes(assertion.trim())) {
        return { action: 'verifyVisible', target, expected: text, confidence: 0.80, source: 'nlp-rule' };
      }
    }

    // ── Low-confidence fallback ─────────────────────────────────────────────
    return { action: 'click', target: text, confidence: 0.40, source: 'nlp-rule' };
  }
}
