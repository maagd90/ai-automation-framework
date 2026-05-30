import { describe, expect, it } from 'vitest';
import { TestDataModelBuilder } from '../../src/core/generator/TestDataModelBuilder';
import type { TestCase } from '../../src/core/domain/TestCase';
import type { LocatorResult } from '../../src/core/domain/LocatorResult';

describe('TestDataModelBuilder', () => {
  const builder = new TestDataModelBuilder();

  it('builds data and references together for credential fields', () => {
    const testCase: TestCase = {
      name: 'Login with valid credentials',
      preconditions: [],
      steps: [
        { order: 1, action: 'enter', target: 'Username field', value: 'standard_user' },
        { order: 2, action: 'enter', target: 'Password field', value: 'secret_sauce' },
      ],
      expectedResults: [],
    };
    const locators: LocatorResult[] = [
      {
        stepOrder: 1,
        stepTarget: 'Username field',
        action: 'enter',
        primaryLocator: { strategy: 'getByPlaceholder', value: 'Username', score: 90, unique: true, validated: true },
        fallbackLocators: [],
        element: { tagName: 'input' },
      },
      {
        stepOrder: 2,
        stepTarget: 'Password field',
        action: 'enter',
        primaryLocator: { strategy: 'getByPlaceholder', value: 'Password', score: 90, unique: true, validated: true },
        fallbackLocators: [],
        element: { tagName: 'input' },
      },
    ];

    const result = builder.build(testCase, locators);
    expect(result.data).toEqual({
      validUser: {
        username: 'standard_user',
        password: 'secret_sauce',
      },
    });
    expect(builder.toExpression(result.referencesByStepOrder.get(1)!, 'loginData')).toBe("loginData.validUser?.username ?? ''");
    expect(builder.toExpression(result.referencesByStepOrder.get(2)!, 'loginData')).toBe("loginData.validUser?.password ?? ''");
  });

  it('keeps generic input references aligned with generated data', () => {
    const testCase: TestCase = {
      name: 'Search for a product',
      preconditions: [],
      steps: [{ order: 1, action: 'enter', target: 'Search input', value: 'backpack' }],
      expectedResults: [],
    };
    const locators: LocatorResult[] = [
      {
        stepOrder: 1,
        stepTarget: 'Search input',
        action: 'enter',
        methodName: 'enterSearch',
        primaryLocator: { strategy: 'getByPlaceholder', value: 'Search', score: 80, unique: true, validated: true },
        fallbackLocators: [],
        element: { tagName: 'input' },
      },
    ];

    const result = builder.build(testCase, locators);
    expect(result.data).toEqual({ inputs: { search: 'backpack' } });
    expect(builder.toExpression(result.referencesByStepOrder.get(1)!, 'searchData')).toBe("searchData.inputs?.search ?? ''");
  });
});
