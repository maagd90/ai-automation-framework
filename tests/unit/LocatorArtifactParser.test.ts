import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocatorArtifactParser } from '../../ai-agent-platform/apps/agent-api/src/services/batch/LocatorArtifactParser';

describe('LocatorArtifactParser', () => {
  const parser = new LocatorArtifactParser();
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
  });

  const writeTemp = (content: unknown, fileName = 'login.locators.json') => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'locator-parser-'));
    tempDirs.push(dir);
    const filePath = path.join(dir, fileName);
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
    return filePath;
  };

  it('parses the legacy steps[] schema', () => {
    const filePath = writeTemp({
      schemaVersion: '1.0.0',
      page: 'Login',
      steps: [
        {
          stepTarget: 'Username field',
          action: 'enter',
          primary: { strategy: 'getByPlaceholder', value: 'Username', score: 84 },
          fallback: [],
        },
      ],
    });

    const result = parser.parseFile(filePath);
    expect(result?.feature).toBe('login');
    expect(result?.entries[0].name).toBe('username');
    expect(result?.entries[0].selector).toContain('getByPlaceholder');
  });

  it('passes through the normalized locators[] schema', () => {
    const filePath = writeTemp({
      feature: 'login',
      locators: [
        {
          name: 'loginButton',
          selector: "page.getByRole('button', { name: 'Login' })",
          strategy: 'getByRole',
          confidenceScore: 0.9,
        },
      ],
    });

    const result = parser.parseFile(filePath);
    expect(result?.entries).toHaveLength(1);
    expect(result?.entries[0].name).toBe('loginButton');
  });
});
