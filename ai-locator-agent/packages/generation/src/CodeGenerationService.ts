import { GenerationRequest, GeneratedArtifact, PageSnapshot } from '@ai-locator/core';
import { GenerationError, createLogger } from '@ai-locator/shared';
import { PlaywrightTypeScriptRenderer } from './renderers/PlaywrightTypeScriptRenderer';
import { PlaywrightPythonRenderer } from './renderers/PlaywrightPythonRenderer';
import { SeleniumJavaRenderer } from './renderers/SeleniumJavaRenderer';
import { SeleniumPythonRenderer } from './renderers/SeleniumPythonRenderer';

type Framework = 'playwright' | 'selenium';
type Language = 'typescript' | 'python' | 'java';

export class CodeGenerationService {
  private readonly logger = createLogger('CodeGenerationService');

  generate(request: GenerationRequest, snapshot: PageSnapshot): GeneratedArtifact {
    const name = request.name ?? 'generated';
    this.logger.info('Generating code', { framework: request.framework, language: request.language });

    const key = `${request.framework}-${request.language}` as `${Framework}-${Language}`;

    switch (key) {
      case 'playwright-typescript':
        return new PlaywrightTypeScriptRenderer().render(snapshot, name);
      case 'playwright-python':
        return new PlaywrightPythonRenderer().render(snapshot, name);
      case 'selenium-java':
        return new SeleniumJavaRenderer().render(snapshot, name);
      case 'selenium-python':
        return new SeleniumPythonRenderer().render(snapshot, name);
      default:
        throw new GenerationError(`Unsupported framework/language: ${request.framework}/${request.language}`);
    }
  }
}
