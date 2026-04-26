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

/**
 * Provides AI-assisted enhancements to the test case parsing and generation pipeline.
 *
 * Wraps an AI provider (Gemini, OpenAI, etc.) and exposes three optional capabilities:
 * - **Parsing**: Normalizes ambiguous test case text to structured JSON, and classifies
 *   low-confidence step intents (action, target, value).
 * - **Naming**: Suggests idiomatic camelCase method names for Page Object Model methods.
 * - **Failure analysis**: Analyzes Playwright test stderr/stdout to produce a structured
 *   diagnosis with a suggested fix.
 *
 * All AI calls fail gracefully — if the provider is unavailable or returns an unexpected
 * response, the service logs a warning and returns undefined so the deterministic fallback
 * is used instead.
 *
 * Usage: instantiate via `AiSupportService.fromEnv()` inside a child agent process,
 * or construct directly with a config object in tests.
 */
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

  /**
   * Creates an AiSupportService instance from environment variables.
   *
   * Reads AI_PROVIDER, AI_API_KEY, AI_MODEL, AI_BASE_URL, AI_USE_FOR_PARSING,
   * AI_USE_FOR_NAMING, and AI_USE_FOR_FAILURE_ANALYSIS. These are set by ChildJobRunner
   * when it spawns a child agent process. Returns a no-op service if AI_PROVIDER is not set.
   */
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

  /**
   * Attempts to normalize raw test case text into a structured JSON string.
   *
   * Called by TestCaseParserFactory when the deterministic parser produces a
   * low-confidence result or fails entirely. The resulting JSON is validated by
   * JsonTestCaseParser before being returned. Returns undefined on failure so the
   * deterministic parser output is used as a fallback.
   *
   * @param rawContent - Raw test case text (TXT or feature file content).
   * @returns Normalized JSON string, or undefined if AI is disabled or the call fails.
   */
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

  /**
   * Classifies the intent of a single ambiguous test step into a structured action descriptor.
   *
   * Used by TestCaseParserFactory when the deterministic parser marks a step as low-confidence.
   * The response is validated to ensure the action is a known ActionType and a target is present.
   * Returns undefined if AI is disabled, the response is invalid, or the call fails.
   *
   * @param stepText - Raw step text string (e.g. "Click the submit button").
   * @returns Classified step with action, target, and optional value; or undefined on failure.
   */
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

  /**
   * Suggests an idiomatic camelCase method name for a Page Object Model method.
   *
   * Used by the code generator to produce readable method names when AI naming is enabled.
   * The response is validated against a camelCase pattern before being accepted.
   * Returns undefined if AI is disabled, the name is invalid, or the call fails —
   * in which case the deterministic naming strategy is used.
   *
   * @param action - The action type (e.g. 'click', 'enter').
   * @param target - The element target description (e.g. 'Login button').
   * @returns Suggested camelCase method name, or undefined if unavailable.
   */
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

  /**
   * Analyzes Playwright test failure output and returns a structured diagnosis.
   *
   * Sanitizes stderr and stdout to remove secrets before sending to the AI provider.
   * Returns a structured FailureAnalysis with a category, summary, and suggested fix.
   * If the provider is unavailable, returns a fallback analysis with category 'ai-unavailable'.
   * Returns undefined if failure analysis is not enabled in the current configuration.
   *
   * @param stderr - Standard error output from the failed Playwright test run.
   * @param stdout - Standard output from the failed Playwright test run.
   * @returns Structured failure analysis, or undefined if the feature is disabled.
   */
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
