import type { AiConfig } from '@ai-agent/shared-types';
import type { IAiProvider } from './providers/AiProviders';
import {
  NoOpProvider,
  OpenAiProvider,
  GeminiProvider,
  AzureProvider,
  LocalLlmProvider,
} from './providers/AiProviders';

export class AiProviderFactory {
  static create(config: AiConfig): IAiProvider {
    switch (config.provider) {
      case 'openai':
        return new OpenAiProvider(config);
      case 'gemini':
        return new GeminiProvider(config);
      case 'azure':
        return new AzureProvider(config);
      case 'local':
        return new LocalLlmProvider(config);
      case 'none':
      default:
        return new NoOpProvider();
    }
  }
}
