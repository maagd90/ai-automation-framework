import { describe, it, expect } from 'vitest';
import { WebwrightTaskBuilder } from '../../ai-agent-platform/apps/agent-api/src/services/webwright/WebwrightTaskBuilder';
import type { TestCase } from '../../ai-agent-platform/packages/shared-types/src/index';

describe('WebwrightTaskBuilder', () => {
  const builder = new WebwrightTaskBuilder();

  const loginTestCase: TestCase = {
    id: 'tc-1',
    name: 'Valid login navigates to products page',
    steps: [
      { order: 1, action: 'navigate', target: 'https://example.com' },
      { order: 2, action: 'fill', target: 'username input', value: 'standard_user' },
      { order: 3, action: 'fill', target: 'password input', value: 'secret_sauce' },
      { order: 4, action: 'click', target: 'login button' },
    ],
    expectedResults: ['products page visible'],
  };

  const cartTestCase: TestCase = {
    id: 'tc-2',
    name: 'Add item to cart shows cart badge',
    steps: [
      { order: 1, action: 'add', target: 'product to cart' },
    ],
    expectedResults: ['cart badge shows 1'],
  };

  const invalidLoginCase: TestCase = {
    id: 'tc-3',
    name: 'Invalid login shows error message',
    steps: [
      { order: 1, action: 'fill', target: 'username input', value: 'wrong_user' },
      { order: 2, action: 'fill', target: 'password input', value: 'wrong_pass' },
      { order: 3, action: 'click', target: 'login button' },
    ],
    expectedResults: ['error message visible'],
  };

  it('builds a task with instruction, targetUrl, and focusAreas', () => {
    const task = builder.build([loginTestCase], 'https://example.com');
    expect(task.targetUrl).toBe('https://example.com');
    expect(typeof task.instruction).toBe('string');
    expect(task.instruction.length).toBeGreaterThan(50);
    expect(Array.isArray(task.focusAreas)).toBe(true);
  });

  it('detects login-fields focus area from username/password steps', () => {
    const task = builder.build([loginTestCase], 'https://example.com');
    expect(task.focusAreas).toContain('login-fields');
  });

  it('detects login-button focus area from login action steps', () => {
    const task = builder.build([loginTestCase], 'https://example.com');
    expect(task.focusAreas).toContain('login-button');
  });

  it('detects add-to-cart-button focus area', () => {
    const task = builder.build([cartTestCase], 'https://example.com');
    expect(task.focusAreas).toContain('add-to-cart-button');
  });

  it('detects cart-badge focus area from cart-related expected results', () => {
    const task = builder.build([cartTestCase], 'https://example.com');
    expect(task.focusAreas).toContain('cart-badge');
  });

  it('detects error-messages focus area from invalid expected results', () => {
    const task = builder.build([invalidLoginCase], 'https://example.com');
    expect(task.focusAreas).toContain('error-messages');
  });

  it('detects products-page focus area from inventory expected results', () => {
    const task = builder.build([loginTestCase], 'https://example.com');
    expect(task.focusAreas).toContain('products-page');
  });

  it('includes test case name in the instruction', () => {
    const task = builder.build([loginTestCase], 'https://example.com');
    expect(task.instruction).toContain('Valid login navigates to products page');
  });

  it('includes target URL in the instruction', () => {
    const task = builder.build([loginTestCase], 'https://example.com');
    expect(task.instruction).toContain('https://example.com');
  });

  it('handles empty test case list gracefully', () => {
    const task = builder.build([], 'https://example.com');
    expect(task.instruction).toBeDefined();
    expect(task.focusAreas).toEqual([]);
  });

  it('deduplicates focus areas across multiple test cases', () => {
    const task = builder.build([loginTestCase, invalidLoginCase], 'https://example.com');
    const loginFields = task.focusAreas.filter((a) => a === 'login-fields');
    expect(loginFields.length).toBe(1);
  });

  it('combines focus areas from multiple test cases', () => {
    const task = builder.build([loginTestCase, cartTestCase], 'https://example.com');
    expect(task.focusAreas).toContain('login-fields');
    expect(task.focusAreas).toContain('add-to-cart-button');
  });
});
