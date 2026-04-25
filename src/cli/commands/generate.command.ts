import { BrowserSessionManager } from '../../core/browser/BrowserSessionManager.js';
import { PageNavigator } from '../../core/browser/PageNavigator.js';
import { DomInspector } from '../../core/browser/DomInspector.js';
import { LocatorService } from '../../core/locator/LocatorService.js';
import { CodeGenerationService } from '../../core/generator/CodeGenerationService.js';
import { TestCaseParserFactory } from '../../core/parser/TestCaseParserFactory.js';
import { FileUtils } from '../../utils/FileUtils.js';
import { Logger } from '../../utils/Logger.js';

interface AiUsageSummary {
  provider: string;
  model?: string;
  calls: number;
  parsingCalls: number;
  namingCalls: number;
  failureAnalysisCalls: number;
}

export class GenerateCommand {
  private readonly logger = new Logger('GenerateCommand');

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
      const navigator = new PageNavigator(page);
      await navigator.navigate(url);

      const inspector = new DomInspector(page);
      const elements = await inspector.collectElements();
      this.logger.info(`Collected ${elements.length} elements`);

      const locatorService = new LocatorService();
      const locators = await locatorService.resolveLocatorsForSteps(page, testCase.steps, elements);
      this.logger.info(`Resolved ${locators.length} locators`);

      const generator = new CodeGenerationService();
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

    const summary: AiUsageSummary = {
      provider: process.env.AI_PROVIDER ?? 'none',
      model: process.env.AI_MODEL || undefined,
      calls: 0,
      parsingCalls: 0,
      namingCalls: 0,
      failureAnalysisCalls: 0,
    };

    FileUtils.writeFile(outputPath, JSON.stringify(summary, null, 2));
  }
}
