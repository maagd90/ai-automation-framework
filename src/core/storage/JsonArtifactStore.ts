import fs from 'fs';
import path from 'path';
import { FileUtils } from '../../utils/FileUtils.js';
import { Logger } from '../../utils/Logger.js';

export class JsonArtifactStore {
  private readonly logger = new Logger('JsonArtifactStore');

  save(filePath: string, data: unknown): void {
    FileUtils.ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    this.logger.info(`Artifact saved: ${filePath}`);
  }

  load<T>(filePath: string): T {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  }
}
