import * as fs from 'fs';
import * as path from 'path';
import { PageSnapshot } from '@locator-agent/core';
import { StorageError, Logger } from '@locator-agent/shared';

export class LocatorRepository {
  private readonly logger = new Logger('LocatorRepository');

  save(snapshot: PageSnapshot, filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
    this.logger.info('Saved snapshot', { filePath });
  }

  load(filePath: string): PageSnapshot {
    if (!fs.existsSync(filePath)) {
      throw new StorageError(`File not found: ${filePath}`);
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as PageSnapshot;
    if (!parsed.schemaVersion) {
      throw new StorageError('Invalid snapshot: missing schemaVersion');
    }
    return parsed;
  }
}
