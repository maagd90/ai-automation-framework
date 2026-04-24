import { describe, it, expect } from 'vitest';
import { StepIntentAnalyzer } from '../../src/core/intent/StepIntentAnalyzer.js';

describe('StepIntentAnalyzer', () => {
  const analyzer = new StepIntentAnalyzer();

  it('detects enter action', () => {
    const intent = analyzer.analyze('Enter "admin@test.com" into Email field');
    expect(intent.action).toBe('enter');
    expect(intent.value).toBe('admin@test.com');
    expect(intent.target).toContain('Email');
  });

  it('detects click action', () => {
    const intent = analyzer.analyze('Click Login button');
    expect(intent.action).toBe('click');
    expect(intent.target).toContain('Login');
  });

  it('detects verifyVisible action', () => {
    const intent = analyzer.analyze('Verify Dashboard is visible');
    expect(intent.action).toBe('verifyVisible');
  });

  it('detects navigate action', () => {
    const intent = analyzer.analyze('Navigate to http://example.com');
    expect(intent.action).toBe('navigate');
  });

  it('detects select action', () => {
    const intent = analyzer.analyze('Select "Admin" from Role dropdown');
    expect(intent.action).toBe('select');
    expect(intent.value).toBe('Admin');
  });

  it('falls back to click for unrecognized text', () => {
    const intent = analyzer.analyze('Do something weird');
    expect(intent.action).toBe('click');
  });
});
