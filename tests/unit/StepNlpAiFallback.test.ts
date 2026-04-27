import { describe, it, expect, vi } from 'vitest';
import { StepNlpAiFallback } from '../../ai-agent-platform/packages/agent-core/src/nlp/StepNlpAiFallback';
import type { IAiProvider, AiCompletionResponse } from '../../ai-agent-platform/packages/agent-core/src/ai/providers/AiProviders';
import type { NlpResult } from '../../ai-agent-platform/packages/agent-core/src/nlp/StepNlpAnalyzer';
import { NLP_CONFIDENCE_THRESHOLD } from '../../ai-agent-platform/packages/agent-core/src/nlp/StepNlpAnalyzer';

function makeRule(action: NlpResult['action'] = 'click', confidence = 0.40): NlpResult {
  return { action, target: 'some element', confidence, source: 'nlp-rule' };
}

function makeProvider(response: string): IAiProvider {
  return {
    name: 'test',
    complete: vi.fn().mockResolvedValue({ text: response, provider: 'test' } satisfies AiCompletionResponse),
  };
}

describe('StepNlpAiFallback', () => {
  describe('called only when confidence < 0.70', () => {
    it('is called when rule confidence is low', async () => {
      const provider = makeProvider(JSON.stringify({ action: 'click', target: 'Login', confidence: 0.90 }));
      const fallback = new StepNlpAiFallback(provider);
      const ruleResult = makeRule('click', 0.40);

      await fallback.classify('click the thing', ruleResult);

      expect(provider.complete).toHaveBeenCalledOnce();
    });

    it('uses AI result when it returns valid JSON', async () => {
      const aiJson = JSON.stringify({ action: 'enter', target: 'Username field', value: 'admin', confidence: 0.92 });
      const provider = makeProvider(aiJson);
      const fallback = new StepNlpAiFallback(provider);
      const ruleResult = makeRule('click', 0.40);

      const result = await fallback.classify('type admin into username', ruleResult);

      expect(result.action).toBe('enter');
      expect(result.target).toBe('Username field');
      expect(result.value).toBe('admin');
      expect(result.confidence).toBe(0.92);
      expect(result.source).toBe('ai-fallback');
    });

    it('returns rule result when AI response is invalid JSON', async () => {
      const provider = makeProvider('NOT VALID JSON AT ALL');
      const fallback = new StepNlpAiFallback(provider);
      const ruleResult = makeRule('click', 0.40);

      const result = await fallback.classify('do something weird', ruleResult);

      expect(result.source).toBe('nlp-rule');
      expect(result.action).toBe('click');
    });

    it('returns rule result when AI response has invalid action', async () => {
      const aiJson = JSON.stringify({ action: 'fly', target: 'Sky', confidence: 0.80 });
      const provider = makeProvider(aiJson);
      const fallback = new StepNlpAiFallback(provider);
      const ruleResult = makeRule('click', 0.40);

      const result = await fallback.classify('some step', ruleResult);

      expect(result.source).toBe('nlp-rule');
    });

    it('returns rule result when AI throws an error', async () => {
      const provider: IAiProvider = {
        name: 'failing',
        complete: vi.fn().mockRejectedValue(new Error('Network error')),
      };
      const fallback = new StepNlpAiFallback(provider);
      const ruleResult = makeRule('click', 0.40);

      const result = await fallback.classify('some step', ruleResult);

      expect(result.source).toBe('nlp-rule');
      expect(result.action).toBe('click');
    });
  });

  describe('AI result validation', () => {
    it('extracts JSON from markdown-wrapped response', async () => {
      const aiJson = `\`\`\`json\n${JSON.stringify({ action: 'select', target: 'Country', value: 'UAE', confidence: 0.88 })}\n\`\`\``;
      const provider = makeProvider(aiJson);
      const fallback = new StepNlpAiFallback(provider);
      const ruleResult = makeRule('click', 0.40);

      const result = await fallback.classify('select UAE from country', ruleResult);

      expect(result.action).toBe('select');
      expect(result.source).toBe('ai-fallback');
    });

    it('clamps confidence to 0-1 range', async () => {
      const aiJson = JSON.stringify({ action: 'click', target: 'Button', confidence: 1.5 });
      const provider = makeProvider(aiJson);
      const fallback = new StepNlpAiFallback(provider);

      const result = await fallback.classify('click a button', makeRule('click', 0.40));

      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });

    it('uses 0.60 as default confidence when AI omits it', async () => {
      const aiJson = JSON.stringify({ action: 'navigate', target: 'Home page' });
      const provider = makeProvider(aiJson);
      const fallback = new StepNlpAiFallback(provider);

      const result = await fallback.classify('go home', makeRule('click', 0.40));

      expect(result.action).toBe('navigate');
      expect(result.confidence).toBe(0.60);
    });
  });

  describe('NLP confidence threshold constant', () => {
    it('is 0.70', () => {
      expect(NLP_CONFIDENCE_THRESHOLD).toBe(0.70);
    });
  });
});
