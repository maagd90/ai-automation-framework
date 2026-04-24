import { BrowserSessionManager } from '../../core/browser/BrowserSessionManager.js';
import { PageNavigator } from '../../core/browser/PageNavigator.js';
import { DomInspector } from '../../core/browser/DomInspector.js';
import { LocatorService } from '../../core/locator/LocatorService.js';
import { CodeGenerationService } from '../../core/generator/CodeGenerationService.js';
import { TestCaseParserFactory } from '../../core/parser/TestCaseParserFactory.js';
import { FileUtils } from '../../utils/FileUtils.js';
import { Logger } from '../../utils/Logger.js';

export class GenerateCommand {
  private readonly logger = new Logger('GenerateCommand');

  async execute(filePath: string, url: string, outputDir: string): Promise<void> {
    this.logger.info('Starting generate command', { filePath, url, outputDir });

    const content = FileUtils.readFile(filePath);
    const parser = TestCaseParserFactory.create(filePath);
    const testCase = parser.parse(content);
    this.logger.info(`Parsed test case: ${testCase.name}`, { steps: testCase.steps.length });

    const session = new BrowserSessionManager();
    try {
      await session.launch({ headless: true });
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
      await session.close();
    }
  }
}
