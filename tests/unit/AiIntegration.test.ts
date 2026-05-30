import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestCaseParserFactory } from '../../src/core/parser/TestCaseParserFactory.js';
import { AiSupportService } from '../../src/core/ai/AiSupportService.js';
import type { IAiProvider } from '../../src/core/ai/AiProviderFactory.js';
import { CodeGenerationService } from '../../src/core/generator/CodeGenerationService.js';
import { GenerateCommand } from '../../src/cli/commands/generate.command.js';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-integration-'));
  tempDirs.push(dir);
  return dir;
}

function createAiSupport(
  provider: IAiProvider,
  overrides?: Partial<ConstructorParameters<typeof AiSupportService>[0]>,
): AiSupportService {
  return new AiSupportService({
    provider: 'gemini',
    apiKey: 'test-key',
    useForParsing: true,
    useForNaming: true,
    useForFailureAnalysis: true,
    ...overrides,
  }, provider);
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
  delete process.env.AI_USAGE_OUTPUT_FILE;
});

describe('AI integration', () => {
  it('does not call AI for structured JSON input', async () => {
    const provider: IAiProvider = {
      name: 'gemini',
      complete: vi.fn(),
    };
    const aiSupport = createAiSupport(provider);

    const testCase = await TestCaseParserFactory.parseWithAiSupport(
      'case.json',
      JSON.stringify({
        name: 'Structured JSON',
        preconditions: [],
        steps: [{ order: 1, action: 'click', target: 'Login button' }],
        expectedResults: ['Dashboard is visible'],
      }),
      aiSupport,
    );

    expect(testCase.name).toBe('Structured JSON');
    expect(provider.complete).not.toHaveBeenCalled();
    expect(aiSupport.getUsageSummary().calls).toBe(0);
  });

  it('uses AI normalize fallback for messy TXT input', async () => {
    const provider: IAiProvider = {
      name: 'gemini',
      complete: vi.fn().mockResolvedValue({
        provider: 'gemini',
        model: 'gemini-1.5-flash',
        text: JSON.stringify({
          name: 'Messy import',
          preconditions: [],
          steps: [{ order: 1, action: 'click', target: 'Submit button' }],
          expectedResults: ['Success message is visible'],
        }),
      }),
    };
    const aiSupport = createAiSupport(provider);

    const testCase = await TestCaseParserFactory.parseWithAiSupport(
      'case.txt',
      'Test Case: Messy import\nSteps:\n1. Do something weird',
      aiSupport,
    );

    expect(testCase.steps[0].action).toBe('click');
    expect(testCase.steps[0].target).toBe('Submit button');
    expect(aiSupport.getUsageSummary().parsingCalls).toBeGreaterThan(0);
  });

  it('falls back to AI step classification when normalize fails', async () => {
    const provider: IAiProvider = {
      name: 'gemini',
      complete: vi
        .fn()
        .mockResolvedValueOnce({
          provider: 'gemini',
          text: 'not json',
        })
        .mockResolvedValueOnce({
          provider: 'gemini',
          text: JSON.stringify({
            action: 'navigate',
            target: 'https://example.com/checkout',
          }),
        }),
    };
    const aiSupport = createAiSupport(provider);

    const testCase = await TestCaseParserFactory.parseWithAiSupport(
      'case.txt',
      'Test Case: Weird flow\nSteps:\n1. Jump to checkout now',
      aiSupport,
    );

    expect(testCase.steps[0].action).toBe('navigate');
    expect(testCase.steps[0].target).toContain('checkout');
    expect(aiSupport.getUsageSummary().parsingCalls).toBe(2);
  });

  it('keeps AI calls at zero when provider is none', async () => {
    const provider: IAiProvider = {
      name: 'none',
      complete: vi.fn(),
    };
    const aiSupport = new AiSupportService({
      provider: 'none',
      useForParsing: true,
      useForNaming: true,
      useForFailureAnalysis: true,
    }, provider);

    await TestCaseParserFactory.parseWithAiSupport(
      'case.txt',
      'Test Case: Weird flow\nSteps:\n1. Jump to checkout now',
      aiSupport,
    );

    expect(provider.complete).not.toHaveBeenCalled();
    expect(aiSupport.getUsageSummary().calls).toBe(0);
  });

  it('uses AI naming only when the deterministic method name is poor', async () => {
    const provider: IAiProvider = {
      name: 'gemini',
      complete: vi.fn().mockResolvedValue({
        provider: 'gemini',
        text: JSON.stringify({ methodName: 'clickCheckoutButton' }),
      }),
    };
    const aiSupport = createAiSupport(provider);
    const outputDir = createTempDir();

    const generator = new CodeGenerationService();
    await generator.generate(
      {
        name: 'Checkout',
        preconditions: [],
        steps: [{ order: 1, action: 'click', target: 'Button' }],
        expectedResults: [],
      },
      'https://example.com/checkout',
      [{
        stepTarget: 'Button',
        action: 'click',
        primaryLocator: { strategy: 'getByText', value: 'Checkout', score: 100, unique: true },
        fallbackLocators: [],
        element: {},
      }],
      outputDir,
      aiSupport,
    );

    const pageObject = fs.readFileSync(
      path.join(outputDir, 'src', 'pages', 'CheckoutPage.ts'),
      'utf8',
    );

    expect(pageObject).toContain('async clickCheckoutButton()');
    expect(aiSupport.getUsageSummary().namingCalls).toBe(1);
  });

  it('writes AI usage summary to AI_USAGE_OUTPUT_FILE', () => {
    const outputDir = createTempDir();
    const outputPath = path.join(outputDir, 'ai-usage.json');
    process.env.AI_USAGE_OUTPUT_FILE = outputPath;

    const command = new GenerateCommand() as unknown as {
      aiSupport: { getUsageSummary: () => unknown };
      writeAiUsageSummary: () => void;
    };
    command.aiSupport = {
      getUsageSummary: () => ({
        provider: 'gemini',
        model: 'gemini-1.5-flash',
        calls: 2,
        parsingCalls: 1,
        namingCalls: 1,
        failureAnalysisCalls: 0,
      }),
    };

    command.writeAiUsageSummary();

    expect(JSON.parse(fs.readFileSync(outputPath, 'utf8'))).toEqual({
      provider: 'gemini',
      model: 'gemini-1.5-flash',
      calls: 2,
      parsingCalls: 1,
      namingCalls: 1,
      failureAnalysisCalls: 0,
    });
  });
});
