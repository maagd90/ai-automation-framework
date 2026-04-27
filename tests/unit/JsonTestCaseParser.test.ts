import { describe, it, expect } from 'vitest';
import { JsonTestCaseParser } from '../../src/core/parser/JsonTestCaseParser.js';

describe('JsonTestCaseParser', () => {
  const parser = new JsonTestCaseParser();

  it('parses strict JSON action enums', () => {
    const content = JSON.stringify({
      name: 'Login with valid credentials',
      preconditions: ['User is on login page'],
      steps: [
        { order: 1, action: 'enter', value: 'admin@test.com', target: 'Email field' },
        { order: 2, action: 'enter', value: 'Password123', target: 'Password field' },
        { order: 3, action: 'click', target: 'Login button' },
      ],
      expectedResults: ['User should be redirected to Dashboard page'],
    });

    const tc = parser.parse(content);
    expect(tc.steps).toHaveLength(3);
    expect(tc.steps[0].action).toBe('enter');
    expect(tc.steps[2].action).toBe('click');
  });

  it('normalizes Gherkin-like action strings in JSON', () => {
    const content = JSON.stringify({
      name: 'User Authentication',
      steps: [
        { order: 1, action: 'Given User is on the login page', target: '' },
        { order: 2, action: 'When Enter "admin@test.com" into Email field' },
        { order: 3, action: 'And Enter "Password123" into Password field' },
        { order: 4, action: 'And Click the Login button' },
        { order: 5, action: 'Then Verify Dashboard is visible' },
      ],
    });

    const tc = parser.parse(content);

    expect(tc.steps).toHaveLength(5);
    expect(tc.steps[1].action).toBe('enter');
    expect(tc.steps[1].value).toBe('admin@test.com');
    expect(tc.steps[1].target).toContain('Email');
    expect(tc.steps[3].action).toBe('click');
    expect(tc.steps[4].action).toBe('verifyVisible');
    expect(tc.steps[4].target).toContain('Dashboard');
  });
});
