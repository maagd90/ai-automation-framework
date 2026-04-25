import { describe, it, expect } from 'vitest';
import { TxtTestCaseParser } from '../../src/core/parser/TxtTestCaseParser.js';

const SAMPLE = `Test Case: Login with valid credentials
Precondition: User is on login page
Steps:
1. Enter "admin@test.com" into Email field
2. Enter "Password123" into Password field
3. Click Login button
Expected Result:
User should be redirected to Dashboard page`;

describe('TxtTestCaseParser', () => {
  const parser = new TxtTestCaseParser();

  it('parses the test case name', () => {
    const tc = parser.parse(SAMPLE);
    expect(tc.name).toBe('Login with valid credentials');
  });

  it('parses preconditions', () => {
    const tc = parser.parse(SAMPLE);
    expect(tc.preconditions).toHaveLength(1);
    expect(tc.preconditions[0]).toBe('User is on login page');
  });

  it('parses steps with correct order', () => {
    const tc = parser.parse(SAMPLE);
    expect(tc.steps).toHaveLength(3);
    expect(tc.steps[0].order).toBe(1);
    expect(tc.steps[0].action).toBe('enter');
    expect(tc.steps[0].value).toBe('admin@test.com');
    expect(tc.steps[0].target).toContain('Email');
  });

  it('parses click actions', () => {
    const tc = parser.parse(SAMPLE);
    expect(tc.steps[2].action).toBe('click');
    expect(tc.steps[2].target).toContain('Login');
  });

  it('parses expected results', () => {
    const tc = parser.parse(SAMPLE);
    expect(tc.expectedResults).toHaveLength(1);
  });
});
