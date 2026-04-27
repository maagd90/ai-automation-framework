import type { IAiProvider, AiCompletionRequest } from '../ai/providers/AiProviders';
import type { NlpResult, NlpActionType } from './StepNlpAnalyzer';

const ALLOWED_ACTIONS: NlpActionType[] = [
  'enter', 'click', 'select', 'check', 'uncheck',
  'verifyVisible', 'verifyText', 'verifyUrl', 'navigate',
];

const AI_FALLBACK_PROMPT = `You are an expert QA automation assistant.

Your task is to convert a natural language test step into a structured automation action.

Input:
Test Step: "{{step}}"

Output JSON format ONLY:

{
  "action": "enter | click | select | check | uncheck | verifyVisible | verifyText | verifyUrl | navigate",
  "target": "UI element description",
  "value": "input value if applicable",
  "expected": "expected outcome if applicable",
  "confidence": number between 0 and 1
}

Rules:
1. Choose ONLY from allowed actions:
   enter, click, select, check, uncheck, verifyVisible, verifyText, verifyUrl, navigate
2. Identify intent clearly:
   - entering text -> enter
   - pressing button -> click
   - choosing dropdown -> select
   - validating UI -> verifyVisible / verifyText
   - redirect/navigation -> verifyUrl or navigate
3. Extract target, value, and expected result.
4. Do not invent missing business rules.
5. If unclear, make best possible guess and reduce confidence.
6. Return ONLY valid JSON.
7. Do not return markdown.`;

interface AiNlpRawResult {
  action?: unknown;
  target?: unknown;
  value?: unknown;
  expected?: unknown;
  confidence?: unknown;
}

/**
 * Calls an AI provider to classify a low-confidence step.
 * Falls back safely to the rule-based result if AI fails or returns invalid JSON.
 */
export class StepNlpAiFallback {
  constructor(private readonly provider: IAiProvider) {}

  async classify(stepText: string, ruleResult: NlpResult): Promise<NlpResult> {
    const prompt = AI_FALLBACK_PROMPT.replace('{{step}}', stepText.replace(/"/g, '\\"'));
    let responseText = '';
    try {
      const req: AiCompletionRequest = { prompt, maxTokens: 256 };
      const response = await this.provider.complete(req);
      responseText = response.text.trim();
    } catch {
      return { ...ruleResult, source: 'nlp-rule' };
    }

    const parsed = this.parseAiResponse(responseText);
    if (!parsed) {
      return { ...ruleResult, source: 'nlp-rule' };
    }
    return { ...parsed, source: 'ai-fallback' };
  }

  private parseAiResponse(text: string): NlpResult | null {
    const jsonText = this.extractJson(text);
    if (!jsonText) return null;

    let raw: AiNlpRawResult;
    try {
      raw = JSON.parse(jsonText) as AiNlpRawResult;
    } catch {
      return null;
    }

    if (typeof raw.action !== 'string') return null;
    const action = raw.action as NlpActionType;
    if (!ALLOWED_ACTIONS.includes(action)) return null;

    const target = typeof raw.target === 'string' ? raw.target : '';
    const value = typeof raw.value === 'string' && raw.value ? raw.value : undefined;
    const expected = typeof raw.expected === 'string' && raw.expected ? raw.expected : undefined;
    const confidence = typeof raw.confidence === 'number'
      ? Math.max(0, Math.min(1, raw.confidence))
      : 0.60;

    return { action, target, value, expected, confidence, source: 'ai-fallback' };
  }

  private extractJson(text: string): string | null {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    return text.slice(start, end + 1);
  }
}
