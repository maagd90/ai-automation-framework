import path from 'path';
import fs from 'fs';
import type { TestCaseBatch } from '@ai-agent/shared-types';
import { JsonBatchTestCaseParser } from './JsonBatchTestCaseParser';
import { TxtBatchTestCaseParser } from './TxtBatchTestCaseParser';
import { FeatureBatchTestCaseParser } from './FeatureBatchTestCaseParser';
import { ExcelBatchTestCaseParser } from './ExcelBatchTestCaseParser';

export class TestCaseParserFactory {
  parse(filePath: string, content: string): TestCaseBatch {
    const ext = path.extname(filePath).toLowerCase();
    const filename = path.basename(filePath);

    switch (ext) {
      case '.json':
        return new JsonBatchTestCaseParser().parse(content, filename);
      case '.txt':
        return new TxtBatchTestCaseParser().parse(content, filename);
      case '.feature':
        return new FeatureBatchTestCaseParser().parse(content, filename);
      default:
        throw new Error(
          `Unsupported file extension "${ext}". Supported: .json, .txt, .feature, .xlsx`,
        );
    }
  }

  /** Async variant for .xlsx files that need buffer-based parsing. */
  async parseAsync(filePath: string): Promise<TestCaseBatch> {
    const ext = path.extname(filePath).toLowerCase();
    const filename = path.basename(filePath);

    if (ext === '.xlsx') {
      const buffer = fs.readFileSync(filePath);
      const { batch } = await new ExcelBatchTestCaseParser().parseBuffer(buffer, filename);
      return batch;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    return this.parse(filePath, content);
  }
}
