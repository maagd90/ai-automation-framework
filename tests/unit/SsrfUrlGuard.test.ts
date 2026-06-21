import { describe, expect, it } from 'vitest';
import {
  isBlockedTargetUrl,
  validateBatchNavigateUrls,
  validateJobUrl,
} from '../../ai-agent-platform/apps/agent-api/src/services/SsrfUrlGuard';

describe('SsrfUrlGuard', () => {
  it('blocks localhost and private IPs', () => {
    expect(isBlockedTargetUrl('http://localhost/admin')).toBe(true);
    expect(isBlockedTargetUrl('http://127.0.0.1/')).toBe(true);
    expect(isBlockedTargetUrl('http://10.0.0.1/')).toBe(true);
    expect(isBlockedTargetUrl('http://192.168.1.1/')).toBe(true);
    expect(isBlockedTargetUrl('http://169.254.169.254/latest/meta-data/')).toBe(true);
  });

  it('allows public https URLs', () => {
    expect(isBlockedTargetUrl('https://example.com/login')).toBe(false);
    expect(validateJobUrl('https://example.com').valid).toBe(true);
  });

  it('blocks navigate steps with internal URLs', () => {
    const result = validateBatchNavigateUrls({
      batchName: 'Suite',
      testCases: [
        {
          id: 'TC1',
          name: 'Probe metadata',
          steps: [{ order: 1, action: 'navigate', target: 'http://169.254.169.254/' }],
        },
      ],
    });
    expect(result.valid).toBe(false);
  });
});
