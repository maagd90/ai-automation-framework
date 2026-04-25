import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { JsonBatchTestCaseParser } from '../../ai-agent-platform/packages/agent-core/src/parsers/JsonBatchTestCaseParser';
import { TestCaseSplitter } from '../../ai-agent-platform/packages/agent-core/src/parsers/TestCaseSplitter';
import { JsonTestCaseParser } from '../../src/core/parser/JsonTestCaseParser.js';

const tempDirs: string[] = [];

describe('TestCaseSplitter', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('writes child json files that the root CLI parser can read', () => {
    const batchJson = JSON.stringify({
      batchName: 'Suite::Login',
      testCases: [
        {
          id: 'TC_LOGIN_001',
          name: 'Login with valid credentials',
          description: 'happy path',
          steps: [
            {
              order: 1,
              action: 'enter',
              target: 'Email field',
              value: 'admin@test.com',
            },
          ],
        },
        {
          id: 'TC_LOGIN_002',
          name: 'Login with invalid password',
          steps: [
            {
              order: 1,
              action: 'enter',
              target: 'Password field',
              value: 'wrong-password',
            },
          ],
        },
      ],
    });

    const batchParser = new JsonBatchTestCaseParser();
    const batch = batchParser.parse(batchJson, 'batch.json');

    expect(batch.testCases).toHaveLength(2);

    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'splitter-test-'));
    tempDirs.push(outputDir);

    const splitResults = new TestCaseSplitter().split(batch, outputDir);

    expect(splitResults.map((result) => path.basename(result.filePath))).toEqual([
      'child-0001.json',
      'child-0002.json',
    ]);

    const rootParser = new JsonTestCaseParser();

    for (const splitResult of splitResults) {
      const rawChild = JSON.parse(fs.readFileSync(splitResult.filePath, 'utf8')) as Record<string, unknown>;

      expect(rawChild).not.toHaveProperty('testCases');
      expect(rawChild.name).toBeTypeOf('string');
      expect(rawChild.preconditions).toEqual([]);
      expect(rawChild.expectedResults).toEqual([]);

      const parsedChild = rootParser.parse(fs.readFileSync(splitResult.filePath, 'utf8'));
      expect(parsedChild.name).toBe(splitResult.testCase.name);
      expect(parsedChild.steps).toHaveLength(1);
    }
  });
});
