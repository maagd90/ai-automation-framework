export class AiPromptService {
  buildNormalizeTestCasePrompt(rawContent: string): string {
    return [
      'You are normalizing a messy QA test case into strict JSON.',
      'Return JSON only. No markdown. No code fences.',
      'Use this schema:',
      '{"name":"string","preconditions":["string"],"steps":[{"order":1,"action":"enter|click|select|check|uncheck|verifyText|verifyVisible|navigate","target":"string","value":"optional","expected":"optional"}],"expectedResults":["string"]}',
      'Preserve user intent. Prefer deterministic, short targets.',
      'Input:',
      rawContent,
    ].join('\n');
  }

  buildClassifyStepIntentPrompt(stepText: string): string {
    return [
      'Classify the QA step into strict JSON only.',
      'Allowed actions: enter, click, select, check, uncheck, verifyText, verifyVisible, navigate.',
      'Return: {"action":"...","target":"...","value":"optional"}',
      'If unsure, choose the most conservative valid action and keep the target concise.',
      `Step: ${stepText}`,
    ].join('\n');
  }

  buildGenerateMethodNamePrompt(action: string, target: string): string {
    return [
      'Generate one concise Playwright page-object method name.',
      'Return JSON only: {"methodName":"camelCaseName"}',
      'Use a clear verb + target pattern.',
      `Action: ${action}`,
      `Target: ${target}`,
    ].join('\n');
  }

  buildFailureAnalysisPrompt(stderr: string, stdout: string): string {
    return [
      'Analyze the Playwright failure and return strict JSON only.',
      'Return: {"category":"string","summary":"string","suggestedFix":"string"}',
      'Do not include secrets, tokens, URLs with credentials, or raw stack dumps.',
      'Focus on a brief actionable diagnosis.',
      'stderr:',
      stderr,
      'stdout:',
      stdout,
    ].join('\n');
  }
}
