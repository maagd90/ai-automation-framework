export interface AiCompletionRequest {
  prompt: string;
  maxTokens?: number;
}

export interface AiCompletionResponse {
  text: string;
  provider: string;
  model?: string;
}

export interface IAiProvider {
  readonly name: string;
  complete(req: AiCompletionRequest): Promise<AiCompletionResponse>;
}

export class NoOpProvider implements IAiProvider {
  readonly name = 'none';
  async complete(): Promise<AiCompletionResponse> {
    return { text: '', provider: this.name };
  }
}

export class OpenAiProvider implements IAiProvider {
  readonly name = 'openai';
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async complete(req: AiCompletionRequest): Promise<AiCompletionResponse> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: req.prompt }],
        max_tokens: req.maxTokens ?? 512,
      }),
    });
    if (!response.ok) throw new Error(`OpenAI API error ${response.status}`);
    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    return { text: data.choices[0]?.message?.content ?? '', provider: this.name, model: this.model };
  }
}

export class AiProviderFactory {
  static fromEnv(): IAiProvider {
    const provider = process.env.AI_PROVIDER ?? 'none';
    if (provider === 'none' || process.env.AI_ENABLED !== 'true') {
      return new NoOpProvider();
    }
    const apiKey = process.env.AI_API_KEY ?? '';
    const model = process.env.AI_MODEL ?? 'gpt-4o-mini';
    if (provider === 'openai' && apiKey) {
      return new OpenAiProvider(apiKey, model);
    }
    return new NoOpProvider();
  }
}

export class AiUsageTracker {
  provider = 'none';
  model?: string;
  calls = 0;
  parsingCalls = 0;
  namingCalls = 0;
  failureAnalysisCalls = 0;

  record(kind: 'parsing' | 'naming' | 'failureAnalysis', provider: string, model?: string): void {
    this.provider = provider;
    this.model = model;
    this.calls += 1;
    if (kind === 'parsing') this.parsingCalls += 1;
    if (kind === 'naming') this.namingCalls += 1;
    if (kind === 'failureAnalysis') this.failureAnalysisCalls += 1;
  }

  toJSON() {
    return {
      provider: this.provider,
      model: this.model,
      calls: this.calls,
      parsingCalls: this.parsingCalls,
      namingCalls: this.namingCalls,
      failureAnalysisCalls: this.failureAnalysisCalls,
    };
  }
}

export class AiAssistService {
  private readonly provider: IAiProvider;
  private readonly useParsing: boolean;
  private readonly useNaming: boolean;
  readonly usage = new AiUsageTracker();

  constructor() {
    this.provider = AiProviderFactory.fromEnv();
    this.useParsing = process.env.AI_USE_FOR_PARSING === 'true';
    this.useNaming = process.env.AI_USE_FOR_NAMING === 'true';
  }

  async suggestTargetMapping(
    stepTarget: string,
    candidates: string[],
  ): Promise<string | undefined> {
    if (!this.useParsing || this.provider.name === 'none') return undefined;
    const response = await this.provider.complete({
      prompt: `Given test step target "${stepTarget}", pick the best matching element label from: ${candidates.join(', ')}. Reply with only the chosen label.`,
      maxTokens: 64,
    });
    this.usage.record('parsing', response.provider, response.model);
    const choice = response.text.trim().replace(/^["']|["']$/g, '');
    return candidates.find((c) => c.toLowerCase() === choice.toLowerCase()) ?? choice;
  }

  async suggestMethodName(action: string, target: string): Promise<string | undefined> {
    if (!this.useNaming || this.provider.name === 'none') return undefined;
    const response = await this.provider.complete({
      prompt: `Suggest a concise camelCase Playwright page object method name for action "${action}" on target "${target}". Reply with only the method name.`,
      maxTokens: 32,
    });
    this.usage.record('naming', response.provider, response.model);
    return response.text.trim().replace(/[^a-zA-Z0-9]/g, '');
  }
}
