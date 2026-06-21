import type { AiConfig } from '@ai-agent/shared-types';
import { ACTION_TYPES } from '@ai-agent/shared-types';
import { AiProviderFactory } from '@ai-agent/agent-core';
import type { NormalizedIntent } from '@ai-agent/agent-core';

/**
 * AI fallback for inferring step intent from natural language (used by batch pipeline).
 */
export function createAiStepInfer(aiConfig: AiConfig): (description: string) => Promise<NormalizedIntent | undefined> {
  const provider = AiProviderFactory.create(aiConfig);

  return async (description: string): Promise<NormalizedIntent | undefined> => {
    if (aiConfig.provider === 'none' || !aiConfig.usedFor?.parsing) {
      return undefined;
    }

    try {
      const response = await provider.complete({
        prompt: `Parse this QA test step into JSON with fields action, target, value (optional).
Allowed actions: ${ACTION_TYPES.join(', ')}.
Step: "${description}"
Reply with ONLY valid JSON like {"action":"click","target":"Login button","value":""}`,
        maxTokens: 128,
      });

      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return undefined;

      const parsed = JSON.parse(jsonMatch[0]) as {
        action?: string;
        target?: string;
        value?: string;
      };

      if (!parsed.action || !ACTION_TYPES.includes(parsed.action as (typeof ACTION_TYPES)[number])) {
        return undefined;
      }

      return {
        action: parsed.action as NormalizedIntent['action'],
        target: parsed.target,
        value: parsed.value,
        confidence: 'medium',
        sourceText: description,
      };
    } catch {
      return undefined;
    }
  };
}
