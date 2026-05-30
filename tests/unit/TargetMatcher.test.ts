import { describe, expect, it } from 'vitest';
import { TargetMatcher } from '../../src/core/locator/TargetMatcher';

describe('TargetMatcher', () => {
  it('matches input[type=submit] login buttons generically', () => {
    const matcher = new TargetMatcher();
    const match = matcher.match(
      'Login button',
      [
        {
          tagName: 'input',
          text: '',
          value: 'Login',
          type: 'submit',
          accessibleName: 'Login',
          inferredRole: 'button',
          visible: true,
          enabled: true,
        },
      ],
      'click',
    );

    expect(match?.element.type).toBe('submit');
    expect(match?.confidence).toBeGreaterThan(60);
  });
});
