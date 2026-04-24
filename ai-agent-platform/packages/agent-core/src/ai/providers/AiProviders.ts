import type { AiConfig } from '@ai-agent/shared-types';

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

  async complete(_req: AiCompletionRequest): Promise<AiCompletionResponse> {
    return { text: '', provider: this.name };
  }
}

export class OpenAiProvider implements IAiProvider {
  readonly name = 'openai';
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: AiConfig) {
    if (!config.apiKey) throw new Error('OpenAI provider requires an apiKey');
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'gpt-4o-mini';
  }

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

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const text = data.choices[0]?.message?.content ?? '';
    return { text, provider: this.name, model: this.model };
  }
}

export class GeminiProvider implements IAiProvider {
  readonly name = 'gemini';
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: AiConfig) {
    if (!config.apiKey) throw new Error('Gemini provider requires an apiKey');
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'gemini-pro';
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResponse> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: req.prompt }] }],
        generationConfig: { maxOutputTokens: req.maxTokens ?? 512 },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    };
    const text = data.candidates[0]?.content?.parts[0]?.text ?? '';
    return { text, provider: this.name, model: this.model };
  }
}

export class AzureProvider implements IAiProvider {
  readonly name = 'azure';
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(config: AiConfig) {
    if (!config.apiKey) throw new Error('Azure provider requires an apiKey');
    if (!config.baseUrl) throw new Error('Azure provider requires a baseUrl');
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.model = config.model ?? 'gpt-4';
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResponse> {
    const url = `${this.baseUrl}/openai/deployments/${this.model}/chat/completions?api-version=2024-02-01`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.apiKey,
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: req.prompt }],
        max_tokens: req.maxTokens ?? 512,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Azure OpenAI API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const text = data.choices[0]?.message?.content ?? '';
    return { text, provider: this.name, model: this.model };
  }
}

/**
 * Compatible with Ollama, LM Studio, vLLM and any OpenAI-compatible local server.
 */
export class LocalLlmProvider implements IAiProvider {
  readonly name = 'local';
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(config: AiConfig) {
    this.baseUrl = (config.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '');
    this.model = config.model ?? 'llama3';
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResponse> {
    const url = `${this.baseUrl}/v1/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: req.prompt }],
        max_tokens: req.maxTokens ?? 512,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Local LLM API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const text = data.choices[0]?.message?.content ?? '';
    return { text, provider: this.name, model: this.model };
  }
}
