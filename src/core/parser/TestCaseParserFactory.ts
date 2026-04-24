import path from 'path';
import type { TestCaseParser } from './TestCaseParser.js';
import { TxtTestCaseParser } from './TxtTestCaseParser.js';
import { JsonTestCaseParser } from './JsonTestCaseParser.js';
import { GherkinTestCaseParser } from './GherkinTestCaseParser.js';

export class TestCaseParserFactory {
  static create(filePath: string): TestCaseParser {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.txt': return new TxtTestCaseParser();
      case '.json': return new JsonTestCaseParser();
      case '.feature': return new GherkinTestCaseParser();
      default: throw new Error(`Unsupported test case file extension: ${ext}`);
    }
  }
}
