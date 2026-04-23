import * as fs from 'fs';
import * as path from 'path';
import { PageSnapshot, GenerationRequest, GeneratedArtifact } from '@locator-agent/core';
import { Logger, GenerationError } from '@locator-agent/shared';
import { PlaywrightTypeScriptRenderer } from './renderers/PlaywrightTypeScriptRenderer';
import { PlaywrightPythonRenderer } from './renderers/PlaywrightPythonRenderer';
import { SeleniumJavaRenderer } from './renderers/SeleniumJavaRenderer';
import { SeleniumPythonRenderer } from './renderers/SeleniumPythonRenderer';

export class CodeGenerationService {
  private readonly logger = new Logger('CodeGenerationService');

  generate(snapshot: PageSnapshot, request: GenerationRequest): GeneratedArtifact {
    const pageName = request.pageName ?? 'page';
    this.logger.info('Generating code', { framework: request.framework, pageName });

    let artifact: GeneratedArtifact;
    switch (request.framework) {
      case 'playwright-typescript':
        artifact = new PlaywrightTypeScriptRenderer().render(snapshot, pageName);
        break;
      case 'playwright-python':
        artifact = new PlaywrightPythonRenderer().render(snapshot, pageName);
        break;
      case 'selenium-java':
        artifact = new SeleniumJavaRenderer().render(snapshot, pageName);
        break;
      case 'selenium-python':
        artifact = new SeleniumPythonRenderer().render(snapshot, pageName);
        break;
      default:
        throw new GenerationError(`Unsupported framework: ${request.framework}`);
    }

    this.writeFiles(artifact, request.outputDir);
    return artifact;
  }

  private writeFiles(artifact: GeneratedArtifact, outputDir: string): void {
    for (const file of artifact.files) {
      const fullPath = path.join(outputDir, file.path);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, file.content, 'utf-8');
      this.logger.info('Generated file', { path: fullPath });
    }
  }
}
