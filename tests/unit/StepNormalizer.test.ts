import { describe, it, expect } from 'vitest';
import { StepNormalizer } from '../../ai-agent-platform/packages/agent-core/src/parsers/StepNormalizer.js';
import { BatchNormalizer } from '../../ai-agent-platform/packages/agent-core/src/parsers/BatchNormalizer.js';

describe('StepNormalizer', () => {
  const normalizer = new StepNormalizer();

  it('detects enter action from description', () => {
    const intent = normalizer.analyze('Enter "admin@test.com" into Email field');
    expect(intent.action).toBe('enter');
    expect(intent.value).toBe('admin@test.com');
    expect(intent.confidence).toBe('high');
  });

  it('detects click action', () => {
    const intent = normalizer.analyze('Click Login button');
    expect(intent.action).toBe('click');
    expect(intent.confidence).toBe('high');
  });

  it('normalizes step with description only', () => {
    const step = normalizer.normalizeStep({
      order: 1,
      action: '',
      description: 'Navigate to https://example.com',
    });
    expect(step.action).toBe('navigate');
    expect(step.target).toContain('example.com');
    expect(step.inferred).toBe(true);
  });

  it('preserves explicit canonical action', () => {
    const step = normalizer.normalizeStep({
      order: 1,
      action: 'click',
      target: 'Submit',
    });
    expect(step.action).toBe('click');
    expect(step.inferred).toBe(false);
  });
});

describe('BatchNormalizer', () => {
  const batchNormalizer = new BatchNormalizer();

  it('normalizes batch with description-only JSON steps', () => {
    const { batch, warnings } = batchNormalizer.normalizeBatchSync({
      batchName: 'NL batch',
      testCases: [
        {
          id: 'TC-001',
          name: 'Login',
          steps: [
            { order: 1, action: '', description: 'Click Login button' },
          ],
        },
      ],
    });
    expect(batch.testCases[0].steps[0].action).toBe('click');
    expect(warnings.length).toBe(1);
  });
});
