import { describe, expect, it } from 'vitest';
import { GeneratedDataReferenceValidator } from '../../ai-agent-platform/apps/agent-api/src/services/batch/GeneratedDataReferenceValidator';

describe('GeneratedDataReferenceValidator', () => {
  it('fails clearly when a spec references a missing JSON path', () => {
    const validator = new GeneratedDataReferenceValidator();
    const issues = validator.validate(
      `await loginPage.enterUsername(loginData.validUser.username);`,
      'loginData',
      { validUser: { password: 'secret_sauce' } },
      'src/tests/login.spec.ts',
      'src/test-data/login.data.json',
    );

    expect(issues).toEqual([
      {
        specPath: 'src/tests/login.spec.ts',
        dataPath: 'src/test-data/login.data.json',
        reference: 'loginData.validUser.username',
      },
    ]);
  });
});
