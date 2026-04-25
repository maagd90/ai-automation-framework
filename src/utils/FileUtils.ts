import fs from 'fs';
import path from 'path';

export class FileUtils {
  static ensureDir(dir: string): void {
    fs.mkdirSync(dir, { recursive: true });
  }

  static writeFile(filePath: string, content: string): void {
    FileUtils.ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  static readFile(filePath: string): string {
    return fs.readFileSync(filePath, 'utf-8');
  }

  static exists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }
}
