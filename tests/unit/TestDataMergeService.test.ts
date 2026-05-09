import { describe, expect, it } from 'vitest';
import { TestDataMergeService } from '../../ai-agent-platform/apps/agent-api/src/services/batch/TestDataMergeService';

describe('TestDataMergeService', () => {
  it('deep merges nested credential data without losing keys', () => {
    const service = new TestDataMergeService();
    const result = service.merge([
      { validUser: { username: 'standard_user' } },
      { validUser: { password: 'secret_sauce' } },
    ]);

    expect(result).toEqual({
      validUser: {
        username: 'standard_user',
        password: 'secret_sauce',
      },
    });
  });
});
