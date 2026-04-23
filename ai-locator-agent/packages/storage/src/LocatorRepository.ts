import { promises as fs } from 'fs';
import * as path from 'path';
import { PageSnapshot } from '@ai-locator/core';
import { StorageError, createLogger } from '@ai-locator/shared';

export class LocatorRepository {
  private readonly logger = createLogger('LocatorRepository');

  async save(snapshot: PageSnapshot, outputPath: string): Promise<void> {
    this.logger.info('Saving snapshot', { path: outputPath });
    try {
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, JSON.stringify(snapshot, null, 2), 'utf8');
    } catch (err) {
      throw new StorageError(`Failed to save snapshot to ${outputPath}`, err);
    }
  }

  async load(filePath: string): Promise<PageSnapshot> {
    this.logger.info('Loading snapshot', { path: filePath });
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return JSON.parse(raw) as PageSnapshot;
    } catch (err) {
      throw new StorageError(`Failed to load snapshot from ${filePath}`, err);
    }
  }
}
