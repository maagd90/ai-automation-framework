import { BrowserSessionManager } from '../../core/browser/BrowserSessionManager.js';
import { PageNavigator } from '../../core/browser/PageNavigator.js';
import { DomInspector } from '../../core/browser/DomInspector.js';
import { LocatorService } from '../../core/locator/LocatorService.js';
import { JsonArtifactStore } from '../../core/storage/JsonArtifactStore.js';
import path from 'path';
import { Logger } from '../../utils/Logger.js';

export class ScanCommand {
  private readonly logger = new Logger('ScanCommand');

  async execute(url: string, outputDir: string): Promise<void> {
    this.logger.info('Starting scan command', { url });

    const session = new BrowserSessionManager();
    try {
      await session.launch({ headless: true });
      const page = session.getPage();

      const navigator = new PageNavigator(page);
      await navigator.navigate(url);

      const inspector = new DomInspector(page);
      const elements = await inspector.collectElements();

      const locatorService = new LocatorService();
      const locators = await locatorService.scanPageLocators(page, elements);

      const artifact = {
        schemaVersion: '1.0.0',
        url,
        generatedAt: new Date().toISOString(),
        elements: locators,
      };

      const outPath = path.join(outputDir, 'locators', 'page.locators.json');
      const store = new JsonArtifactStore();
      store.save(outPath, artifact);

      this.logger.info(`Locator artifact saved: ${outPath}`);
      console.log(JSON.stringify(artifact, null, 2));
    } finally {
      await session.close();
    }
  }
}
