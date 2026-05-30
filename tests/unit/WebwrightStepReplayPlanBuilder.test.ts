import { describe, expect, it } from 'vitest';
import { WebwrightStepReplayPlanBuilder } from '../../ai-agent-platform/apps/agent-api/src/services/webwright/WebwrightStepReplayPlanBuilder';

describe('WebwrightStepReplayPlanBuilder', () => {
  const builder = new WebwrightStepReplayPlanBuilder();
  const generatedData = {
    credentials: {
      validUser: { username: 'standard_user', password: 'secret_sauce' },
      invalidUser: { username: 'locked_out_user', password: 'wrong_password' },
    },
    inputs: { searchTerm: 'bike' },
    warnings: [],
    sourceFiles: [],
  };

  it('builds a replay plan from original test steps', () => {
    const result = builder.buildFromTestCases([
      {
        id: 'login',
        name: 'Valid login',
        steps: [
          { order: 1, action: 'navigate', target: 'https://example.com' },
          { order: 2, action: 'fill', target: 'username input' },
          { order: 3, action: 'fill', target: 'password input' },
          { order: 4, action: 'click', target: 'login button' },
        ],
      },
    ], generatedData);

    expect(result.steps[0]).toEqual({ action: 'navigate', target: 'baseUrl' });
    expect(result.steps.some((step) => step.action === 'fill' && step.valueRef === 'validUser.username')).toBe(true);
    expect(result.steps.some((step) => step.action === 'fill' && step.valueRef === 'validUser.password')).toBe(true);
    expect(result.steps.some((step) => step.action === 'click' && step.target === 'login button')).toBe(true);
  });

  it('does not create random clicks for unsupported actions', () => {
    const result = builder.buildFromTestCases([
      {
        id: 'unsupported',
        name: 'Unsupported action',
        steps: [{ order: 1, action: 'hover', target: 'mystery control' }],
      },
    ], generatedData);

    expect(result.steps.filter((step) => step.action === 'click')).toHaveLength(0);
    expect(result.warnings.some((warning) => warning.includes('No deterministic replay action'))).toBe(true);
  });

  it('marks explicit unsafe actions without inventing replacements', () => {
    const result = builder.buildFromTestCases([
      {
        id: 'unsafe',
        name: 'Delete account',
        steps: [{ order: 1, action: 'click', target: 'delete account' }],
      },
    ], generatedData);

    expect(result.steps.some((step) => step.unsafe)).toBe(true);
    expect(result.steps.some((step) => step.action === 'click' && step.target === 'delete account')).toBe(true);
  });
});
