import path from 'path';
import type { TestCaseBatch } from '@ai-agent/shared-types';
import { JsonBatchTestCaseParser } from './JsonBatchTestCaseParser';
import { TxtBatchTestCaseParser } from './TxtBatchTestCaseParser';
import { FeatureBatchTestCaseParser } from './FeatureBatchTestCaseParser';

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
          `Unsupported file extension "${ext}". Supported: .json, .txt, .feature`,
        );
    }
  }
}
