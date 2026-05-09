import { describe, expect, it, vi } from 'vitest';
import { ProgressiveLocatorResolver } from '../../src/core/locator/ProgressiveLocatorResolver';
import type { LocatorResult } from '../../src/core/domain/LocatorResult';
import type { TestStep } from '../../src/core/domain/TestStep';

describe('ProgressiveLocatorResolver', () => {
  it('re-inspects the DOM after prerequisite actions', async () => {
    const steps: TestStep[] = [
      { order: 1, action: 'click', target: 'Login button' },
      { order: 2, action: 'click', target: 'Add to cart button' },
    ];
    const inspections: string[][] = [];
    const fakePage = {
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
    } as unknown as import('playwright').Page;

    const locators: Record<number, LocatorResult> = {
      1: {
        stepOrder: 1,
        stepTarget: 'Login button',
        action: 'click',
        primaryLocator: { strategy: 'getByRole', value: '{"role":"button","name":"Login"}', score: 95, validated: true, unique: true },
        fallbackLocators: [],
        element: { tagName: 'input' },
      },
      2: {
        stepOrder: 2,
        stepTarget: 'Add to cart button',
        action: 'click',
        primaryLocator: { strategy: 'getByRole', value: '{"role":"button","name":"Add to cart"}', score: 95, validated: true, unique: true },
        fallbackLocators: [],
        element: { tagName: 'button' },
      },
    };

    const resolver = new ProgressiveLocatorResolver({
      inspectorFactory: (() => {
        let call = 0;
        return () => ({
          collectElements: async () => {
            call += 1;
            const current = call === 1 ? ['Login'] : ['Add to cart'];
            inspections.push(current);
            return current.map((name) => ({
              tagName: 'button',
              text: name,
              accessibleName: name,
              inferredRole: 'button',
              visible: true,
              enabled: true,
            }));
          },
        });
      })(),
      locatorService: {
        resolveLocatorForStep: vi.fn(async (_page, step) => locators[step.order] ?? null),
        resolvePlaywrightLocator: vi.fn(() => ({
          click: vi.fn().mockResolvedValue(undefined),
          fill: vi.fn().mockResolvedValue(undefined),
          selectOption: vi.fn().mockResolvedValue(undefined),
          check: vi.fn().mockResolvedValue(undefined),
          uncheck: vi.fn().mockResolvedValue(undefined),
        })),
      } as unknown as import('../../src/core/locator/LocatorService').LocatorService,
    });

    const result = await resolver.resolve(fakePage, 'https://example.com/login', steps);
    expect(result).toHaveLength(2);
    expect(inspections).toEqual([['Login'], ['Add to cart']]);
  });
});
