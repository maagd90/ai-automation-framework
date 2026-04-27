import { describe, it, expect } from 'vitest';
import { StepIntentAnalyzer } from '../../src/core/intent/StepIntentAnalyzer.js';
import { JsonTestCaseParser } from '../../src/core/parser/JsonTestCaseParser.js';

describe('Regression: existing parsers still work', () => {
  describe('StepIntentAnalyzer (root level)', () => {
    const analyzer = new StepIntentAnalyzer();

    it('detects enter', () => {
      const r = analyzer.analyze('Enter "admin" into Email field');
      expect(r.action).toBe('enter');
      expect(r.value).toBe('admin');
    });

    it('detects click', () => {
      const r = analyzer.analyze('Click Login button');
      expect(r.action).toBe('click');
    });

    it('detects verifyVisible', () => {
      const r = analyzer.analyze('Verify Dashboard is visible');
      expect(r.action).toBe('verifyVisible');
    });

    it('detects navigate', () => {
      const r = analyzer.analyze('Navigate to http://example.com');
      expect(r.action).toBe('navigate');
    });

    it('detects select', () => {
      const r = analyzer.analyze('Select "Admin" from Role dropdown');
      expect(r.action).toBe('select');
    });

    it('detects new verifyUrl action', () => {
      const r = analyzer.analyze('Should be redirected to dashboard');
      expect(r.action).toBe('verifyUrl');
    });

    it('falls back to click', () => {
      const r = analyzer.analyze('Do something weird');
      expect(r.action).toBe('click');
    });
  });

  describe('JsonTestCaseParser (root level)', () => {
    const parser = new JsonTestCaseParser();

    it('parses valid JSON test case', () => {
      const json = JSON.stringify({
        name: 'Login Test',
        steps: [
          { order: 1, action: 'navigate', target: 'https://example.com' },
          { order: 2, action: 'enter', target: 'Username field', value: 'admin' },
          { order: 3, action: 'click', target: 'Login button' },
          { order: 4, action: 'verifyVisible', target: 'Dashboard' },
        ],
        expectedResults: ['Dashboard is visible'],
        preconditions: [],
      });

      const tc = parser.parse(json);
      expect(tc.name).toBe('Login Test');
      expect(tc.steps).toHaveLength(4);
      expect(tc.steps[0].action).toBe('navigate');
    });

    it('parses verifyUrl action (Phase 2 addition)', () => {
      const json = JSON.stringify({
        name: 'Redirect Test',
        steps: [
          { order: 1, action: 'click', target: 'Login button' },
          { order: 2, action: 'verifyUrl', target: '/dashboard' },
        ],
        expectedResults: ['Dashboard URL shown'],
        preconditions: [],
      });

      const tc = parser.parse(json);
      expect(tc.steps[1].action).toBe('verifyUrl');
    });

    it('parses step with expected field', () => {
      const json = JSON.stringify({
        name: 'Assertion Test',
        steps: [
          { order: 1, action: 'verifyVisible', target: 'Success message', expected: 'Success!' },
        ],
        expectedResults: [],
        preconditions: [],
      });

      const tc = parser.parse(json);
      expect(tc.steps[0].expected).toBe('Success!');
    });
  });
});

describe('Assertion generation helpers', () => {
  describe('verifyUrl detection patterns', () => {
    const analyzer = new StepIntentAnalyzer();

    it('detects "should be redirected to" pattern', () => {
      const r = analyzer.analyze('Should be redirected to dashboard');
      expect(r.action).toBe('verifyUrl');
      expect(r.target).toContain('dashboard');
    });

    it('detects "URL should be" pattern', () => {
      const r = analyzer.analyze('URL should be /home');
      expect(r.action).toBe('verifyUrl');
    });

    it('detects "is redirected to" pattern', () => {
      const r = analyzer.analyze('Is redirected to profile page');
      expect(r.action).toBe('verifyUrl');
    });
  });
});
