import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { WebwrightGeneratedDataExtractor } from '../../ai-agent-platform/apps/agent-api/src/services/webwright/WebwrightGeneratedDataExtractor';

describe('WebwrightGeneratedDataExtractor', () => {
  const createProject = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webwright-data-'));
    fs.mkdirSync(path.join(dir, 'src', 'test-data'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src', 'test-data', 'login.data.json'),
      JSON.stringify({
        validUser: { username: 'standard_user', password: 'secret_sauce' },
        invalidUser: { username: 'locked_out_user', password: 'wrong_password' },
        inputs: { searchTerm: 'bike', apiKey: 'sk-test-123' },
      }, null, 2),
    );
    return dir;
  };

  it('extracts credentials and inputs from generated test data', () => {
    const extractor = new WebwrightGeneratedDataExtractor();
    const result = extractor.extract(createProject());

    expect(result.credentials.validUser.username).toBe('standard_user');
    expect(result.credentials.validUser.password).toBe('secret_sauce');
    expect(result.credentials.invalidUser.username).toBe('locked_out_user');
    expect(result.credentials.invalidUser.password).toBe('wrong_password');
    expect(result.inputs.searchTerm).toBe('bike');
  });

  it('handles missing data files without inventing values', () => {
    const extractor = new WebwrightGeneratedDataExtractor();
    const result = extractor.extract(fs.mkdtempSync(path.join(os.tmpdir(), 'webwright-empty-')));

    expect(result.credentials.validUser).toEqual({});
    expect(result.credentials.invalidUser).toEqual({});
    expect(result.inputs).toEqual({});
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('redacts sensitive values in log-safe output', () => {
    const extractor = new WebwrightGeneratedDataExtractor();
    const safe = extractor.toLogSafe(extractor.extract(createProject()));

    expect(safe.credentials.validUser.username).toBe('[REDACTED]');
    expect(safe.credentials.validUser.password).toBe('[REDACTED]');
    expect(safe.credentials.invalidUser.username).toBe('[REDACTED]');
    expect(safe.inputs.apiKey).toBe('[REDACTED]');
    expect(safe.inputs.searchTerm).toBe('bike');
  });
});
