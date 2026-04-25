import type { ActionType } from '../domain/TestStep.js';
import { Logger } from '../../utils/Logger.js';
import { JsonTestCaseParser } from '../parser/JsonTestCaseParser.js';
import { AiPromptService } from './AiPromptService.js';
import { AiProviderFactory, type IAiProvider, type RootAiConfig } from './AiProviderFactory.js';
import { AiUsageTracker, type AiUsageSummary } from './AiUsageTracker.js';

export interface FailureAnalysis {
  category: string;
  summary: string;
  suggestedFix: string;
  warning?: string;
}

export interface ClassifiedStepIntent {
  action: ActionType;
  target: string;
  value?: string;
}

const VALID_ACTIONS = new Set<ActionType>([
  'enter',
  'click',
  'select',
  'check',
  'uncheck',
  'verifyText',
  'verifyVisible',
  'navigate',
]);

export class AiSupportService {
  private readonly logger = new Logger('AiSupportService');
  private readonly promptService = new AiPromptService();
  private readonly provider: IAiProvider;
  private readonly usage: AiUsageTracker;

  constructor(private readonly config: RootAiConfig & {
    useForParsing: boolean;
    useForNaming: boolean;
    useForFailureAnalysis: boolean;
  }, provider?: IAiProvider) {
    this.provider = provider ?? AiProviderFactory.create(config);
    this.usage = new AiUsageTracker(config.provider, config.model);
  }

  static fromEnv(): AiSupportService {
    return new AiSupportService({
      provider: (process.env.AI_PROVIDER as RootAiConfig['provider']) ?? 'none',
      apiKey: process.env.AI_API_KEY || undefined,
      model: process.env.AI_MODEL || undefined,
      baseUrl: process.env.AI_BASE_URL || undefined,
      useForParsing: process.env.AI_USE_FOR_PARSING === 'true',
      useForNaming: process.env.AI_USE_FOR_NAMING === 'true',
      useForFailureAnalysis: process.env.AI_USE_FOR_FAILURE_ANALYSIS === 'true',
    });
  }

  isAiEnabled(): boolean {
    return this.config.provider !== 'none';
  }

  canUseParsing(): boolean {
    return this.isAiEnabled() && this.config.useForParsing;
  }

  canUseNaming(): boolean {
    return this.isAiEnabled() && this.config.useForNaming;
  }

  canUseFailureAnalysis(): boolean {
    return this.isAiEnabled() && this.config.useForFailureAnalysis;
  }

  getUsageSummary(): AiUsageSummary {
    return this.usage.snapshot();
  }

  async normalizeTestCase(rawContent: string): Promise<string | undefined> {
    if (!this.canUseParsing()) return undefined;

    try {
      this.usage.record('parsing');
      const response = await this.provider.complete({
        prompt: this.promptService.buildNormalizeTestCasePrompt(rawContent),
        maxTokens: 1024,
      });
      const normalizedJson = this.extractJsonObject(response.text);
      new JsonTestCaseParser().parse(normalizedJson);
      return normalizedJson;
    } catch (error) {
      this.logger.warn('AI normalize fallback failed; continuing with deterministic parser', {
        provider: this.config.provider,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  async classifyStepIntent(stepText: string): Promise<ClassifiedStepIntent | undefined> {
    if (!this.canUseParsing()) return undefined;

    try {
      this.usage.record('parsing');
      const response = await this.provider.complete({
        prompt: this.promptService.buildClassifyStepIntentPrompt(stepText),
        maxTokens: 256,
      });
      const raw = JSON.parse(this.extractJsonObject(response.text)) as {
        action?: string;
        target?: string;
        value?: string;
      };
      if (!raw.action || !VALID_ACTIONS.has(raw.action as ActionType) || !raw.target) {
        return undefined;
      }
      return {
        action: raw.action as ActionType,
        target: raw.target.trim(),
        value: raw.value?.trim() || undefined,
      };
    } catch (error) {
      this.logger.warn('AI step classification fallback failed; keeping deterministic intent', {
        provider: this.config.provider,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  async suggestMethodName(action: string, target: string): Promise<string | undefined> {
    if (!this.canUseNaming()) return undefined;

    try {
      this.usage.record('naming');
      const response = await this.provider.complete({
        prompt: this.promptService.buildGenerateMethodNamePrompt(action, target),
        maxTokens: 128,
      });
      const raw = JSON.parse(this.extractJsonObject(response.text)) as { methodName?: string };
      const methodName = raw.methodName?.trim();
      if (!methodName || !/^[a-z][A-Za-z0-9]*$/.test(methodName)) {
        return undefined;
      }
      return methodName;
    } catch (error) {
      this.logger.warn('AI method naming fallback failed; keeping deterministic name', {
        provider: this.config.provider,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  async analyzeFailure(stderr: string, stdout: string): Promise<FailureAnalysis | undefined> {
    if (!this.canUseFailureAnalysis()) return undefined;

    try {
      this.usage.record('failureAnalysis');
      const response = await this.provider.complete({
        prompt: this.promptService.buildFailureAnalysisPrompt(
          this.sanitizeLogs(stderr),
          this.sanitizeLogs(stdout),
        ),
        maxTokens: 256,
      });
      const raw = JSON.parse(this.extractJsonObject(response.text)) as FailureAnalysis;
      if (!raw.category || !raw.summary || !raw.suggestedFix) {
        return undefined;
      }
      return raw;
    } catch (error) {
      return {
        category: 'ai-unavailable',
        summary: 'AI failure analysis was unavailable; see sanitized test logs.',
        suggestedFix: 'Review the Playwright stderr/stdout in the execution report and retry with a valid AI provider if needed.',
        warning: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private extractJsonObject(text: string): string {
    const trimmed = text.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return trimmed;
    }
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error('AI response did not contain JSON');
    }
    return match[0];
  }

  private sanitizeLogs(text: string): string {
    return text
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
      .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED_API_KEY]')
      .replace(/api[_-]?key["'=:\s]+[A-Za-z0-9._-]+/gi, 'apiKey=[REDACTED]')
      .replace(/[A-Za-z0-9._%+-]+:[^@\s]+@/g, '[REDACTED_CREDENTIALS]@')
      .slice(0, 4000);
  }
}
