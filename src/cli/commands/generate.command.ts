import { BrowserSessionManager } from '../../core/browser/BrowserSessionManager.js';
import { StepwiseLocatorResolver } from '../../core/locator/StepwiseLocatorResolver.js';
import { AiAssistService } from '../../core/ai/AiAssistService.js';
import { CodeGenerationService } from '../../core/generator/CodeGenerationService.js';
import { TestCaseParserFactory } from '../../core/parser/TestCaseParserFactory.js';
import { FileUtils } from '../../utils/FileUtils.js';
import { Logger } from '../../utils/Logger.js';

export class GenerateCommand {
  private readonly logger = new Logger('GenerateCommand');
  private readonly aiAssist = new AiAssistService();

  async execute(filePath: string, url: string, outputDir: string, headless = true): Promise<void> {
    this.logger.info('Starting generate command', { filePath, url, outputDir, headless });

    const content = FileUtils.readFile(filePath);
    const parser = TestCaseParserFactory.create(filePath);
    const testCase = parser.parse(content);
    this.logger.info(`Parsed test case: ${testCase.name}`, { steps: testCase.steps.length });

    const session = new BrowserSessionManager();
    try {
      await session.launch({ headless });
      const page = session.getPage();

      const resolver = new StepwiseLocatorResolver(page, this.aiAssist);
      const locators = await resolver.resolve(testCase.steps, url);
      this.logger.info(`Resolved ${locators.length} locators`);

      const generator = new CodeGenerationService(this.aiAssist);
      const artifact = await generator.generate(testCase, url, locators, outputDir);
      this.logger.info('Generation complete', { artifact: JSON.stringify(artifact) });

      console.log(JSON.stringify(artifact, null, 2));
    } finally {
      this.writeAiUsageSummary();
      await session.close();
    }
  }

  private writeAiUsageSummary(): void {
    const outputPath = process.env.AI_USAGE_OUTPUT_FILE;
    if (!outputPath) return;
    FileUtils.writeFile(outputPath, JSON.stringify(this.aiAssist.usage.toJSON(), null, 2));
  }
}
