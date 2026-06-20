import type { AiConfig } from '@ai-agent/shared-types';
import { AiProviderFactory } from '@ai-agent/agent-core';

export interface FailureAnalysisResult {
  failureType: string;
  suggestion: string;
  confidence: number;
}

export async function analyzeFailureWithAi(
  aiConfig: AiConfig | undefined,
  params: {
    errorMessage: string;
    testCaseId: string;
    domCandidates?: string[];
  },
): Promise<FailureAnalysisResult | undefined> {
  if (!aiConfig?.usedFor?.failureAnalysis || aiConfig.provider === 'none') {
    return undefined;
  }

  const provider = AiProviderFactory.create(aiConfig);
  const candidateList = params.domCandidates?.slice(0, 20).join(', ') ?? 'unknown';

  try {
    const response = await provider.complete({
      prompt: `Analyze this Playwright test failure and suggest a fix.
Test case: ${params.testCaseId}
Error: ${params.errorMessage}
DOM labels on page: ${candidateList}

Reply with JSON only:
{"failureType":"locator|assertion|navigation|timing","suggestion":"...","confidence":0.0-1.0}`,
      maxTokens: 256,
    });

    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return undefined;

    const parsed = JSON.parse(jsonMatch[0]) as FailureAnalysisResult;
    return {
      failureType: parsed.failureType ?? 'unknown',
      suggestion: parsed.suggestion ?? response.text.trim(),
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    };
  } catch {
    return undefined;
  }
}
