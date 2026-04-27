import { describe, it, expect } from 'vitest';
import {
  StepNlpAnalyzer,
  NLP_CONFIDENCE_THRESHOLD,
  normalizeActionColumn,
} from '../../ai-agent-platform/packages/agent-core/src/nlp/StepNlpAnalyzer';

describe('StepNlpAnalyzer (agent-core)', () => {
  const analyzer = new StepNlpAnalyzer();

  describe('enter action', () => {
    it('detects enter with quoted value and into', () => {
      const result = analyzer.analyze('Enter "standard_user" into Username field');
      expect(result.action).toBe('enter');
      expect(result.value).toBe('standard_user');
      expect(result.target).toContain('Username');
      expect(result.confidence).toBeGreaterThanOrEqual(NLP_CONFIDENCE_THRESHOLD);
      expect(result.source).toBe('nlp-rule');
    });

    it('detects enter with word value and into form', () => {
      const result = analyzer.analyze('Enter username into Username field');
      expect(result.action).toBe('enter');
      expect(result.value).toBe('username');
      expect(result.confidence).toBeGreaterThanOrEqual(NLP_CONFIDENCE_THRESHOLD);
    });

    it('detects enter with last-word-as-value pattern', () => {
      const result = analyzer.analyze('Enter username standard_user');
      expect(result.action).toBe('enter');
      expect(result.value).toBe('standard_user');
      expect(result.target).toContain('username');
      expect(result.confidence).toBeGreaterThanOrEqual(NLP_CONFIDENCE_THRESHOLD);
    });

    it('detects type synonym', () => {
      const result = analyzer.analyze('Type password secret123');
      expect(result.action).toBe('enter');
    });

    it('detects fill synonym', () => {
      const result = analyzer.analyze('Fill email test@test.com');
      expect(result.action).toBe('enter');
    });
  });

  describe('click action', () => {
    it('detects click', () => {
      const result = analyzer.analyze('Click Login button');
      expect(result.action).toBe('click');
      expect(result.target).toContain('Login button');
      expect(result.confidence).toBeGreaterThanOrEqual(NLP_CONFIDENCE_THRESHOLD);
    });

    it('detects press synonym', () => {
      const result = analyzer.analyze('Press Submit');
      expect(result.action).toBe('click');
    });

    it('detects tap synonym', () => {
      const result = analyzer.analyze('Tap the Cancel button');
      expect(result.action).toBe('click');
      expect(result.target).toContain('Cancel button');
    });
  });

  describe('select action', () => {
    it('detects select with from', () => {
      const result = analyzer.analyze('Select UAE from Country dropdown');
      expect(result.action).toBe('select');
      expect(result.value).toBe('UAE');
      expect(result.target).toContain('Country dropdown');
      expect(result.confidence).toBeGreaterThanOrEqual(NLP_CONFIDENCE_THRESHOLD);
    });

    it('detects select with quoted value from', () => {
      const result = analyzer.analyze('Select "Admin" from Role dropdown');
      expect(result.action).toBe('select');
      expect(result.value).toBe('Admin');
      expect(result.target).toContain('Role dropdown');
    });

    it('detects choose synonym', () => {
      const result = analyzer.analyze('Choose English from Language');
      expect(result.action).toBe('select');
    });
  });

  describe('verifyVisible action', () => {
    it('detects verify visible', () => {
      const result = analyzer.analyze('Verify Products page is visible');
      expect(result.action).toBe('verifyVisible');
      expect(result.target).toContain('Products page');
      expect(result.confidence).toBeGreaterThanOrEqual(NLP_CONFIDENCE_THRESHOLD);
    });

    it('detects "should be visible" form', () => {
      const result = analyzer.analyze('The dashboard should be visible');
      expect(result.action).toBe('verifyVisible');
    });

    it('detects assert synonym', () => {
      const result = analyzer.analyze('Assert error message is displayed');
      expect(result.action).toBe('verifyVisible');
    });
  });

  describe('verifyUrl action', () => {
    it('detects redirect to URL', () => {
      const result = analyzer.analyze('User should be redirected to dashboard');
      expect(result.action).toBe('verifyUrl');
      expect(result.target).toContain('dashboard');
      expect(result.confidence).toBeGreaterThanOrEqual(NLP_CONFIDENCE_THRESHOLD);
    });

    it('detects URL should be form', () => {
      const result = analyzer.analyze('URL should be /home');
      expect(result.action).toBe('verifyUrl');
    });
  });

  describe('navigate action', () => {
    it('detects navigate to', () => {
      const result = analyzer.analyze('Navigate to https://example.com');
      expect(result.action).toBe('navigate');
    });

    it('detects go to', () => {
      const result = analyzer.analyze('Go to login page');
      expect(result.action).toBe('navigate');
    });
  });

  describe('check/uncheck action', () => {
    it('detects check', () => {
      const result = analyzer.analyze('Check the Remember me checkbox');
      expect(result.action).toBe('check');
    });

    it('detects uncheck', () => {
      const result = analyzer.analyze('Uncheck the newsletter option');
      expect(result.action).toBe('uncheck');
    });

    it('detects untick synonym', () => {
      const result = analyzer.analyze('Untick the terms checkbox');
      expect(result.action).toBe('uncheck');
    });
  });

  describe('low-confidence ambiguous step', () => {
    it('returns low confidence for ambiguous text', () => {
      const result = analyzer.analyze('Do something with the form');
      expect(result.confidence).toBeLessThan(NLP_CONFIDENCE_THRESHOLD);
    });

    it('falls back to click for unrecognized text', () => {
      const result = analyzer.analyze('Perform a mysterious action');
      expect(result.action).toBe('click');
      expect(result.confidence).toBeLessThan(NLP_CONFIDENCE_THRESHOLD);
    });
  });
});

describe('normalizeActionColumn', () => {
  it('normalizes input synonyms to enter', () => {
    expect(normalizeActionColumn('input')).toBe('enter');
    expect(normalizeActionColumn('type')).toBe('enter');
    expect(normalizeActionColumn('fill')).toBe('enter');
    expect(normalizeActionColumn('Enter')).toBe('enter');
    expect(normalizeActionColumn('write')).toBe('enter');
  });

  it('normalizes click synonyms', () => {
    expect(normalizeActionColumn('press')).toBe('click');
    expect(normalizeActionColumn('click')).toBe('click');
    expect(normalizeActionColumn('tap')).toBe('click');
  });

  it('normalizes select synonyms', () => {
    expect(normalizeActionColumn('choose')).toBe('select');
    expect(normalizeActionColumn('dropdown')).toBe('select');
    expect(normalizeActionColumn('select')).toBe('select');
  });

  it('normalizes verify synonyms', () => {
    expect(normalizeActionColumn('verify')).toBe('verifyVisible');
    expect(normalizeActionColumn('validate')).toBe('verifyVisible');
    expect(normalizeActionColumn('assert')).toBe('verifyVisible');
  });

  it('normalizes uncheck synonyms', () => {
    expect(normalizeActionColumn('untick')).toBe('uncheck');
    expect(normalizeActionColumn('uncheck')).toBe('uncheck');
  });

  it('returns null for unknown action', () => {
    expect(normalizeActionColumn('fly')).toBeNull();
    expect(normalizeActionColumn('')).toBeNull();
  });
});
