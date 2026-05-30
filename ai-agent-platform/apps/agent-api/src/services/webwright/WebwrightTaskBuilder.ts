import type { TestCase } from '@ai-agent/shared-types';
import type { WebwrightFailureCategory } from './WebwrightFailureClassifier';
import type { WebwrightFailureContext } from './WebwrightFailureContextExtractor';
import type { WebwrightGeneratedDataSnapshot } from './WebwrightGeneratedDataExtractor';
import type { WebwrightPageObjectMetadata } from './WebwrightPageObjectMapper';
import type { WebwrightReplayPlan } from './WebwrightStepReplayPlanBuilder';

export interface WebwrightTask {
  /** Human-readable instruction sent to the Webwright exploration agent. */
  instruction: string;
  /** Target URL to explore. */
  targetUrl: string;
  /** Logical mode driving what the agent focuses on. */
  focusAreas: string[];
  generatedData?: WebwrightGeneratedDataSnapshot;
  replayPlan?: WebwrightReplayPlan;
  failureContext?: WebwrightFailureContext;
  pageObjects?: WebwrightPageObjectMetadata[];
}

export interface WebwrightRepairTaskInput {
  targetUrl: string;
  failedSpecPath: string;
  failureCategory: WebwrightFailureCategory;
  summary: string;
  stdout: string;
  stderr: string;
  generatedFiles: string[];
  pageObjects: string[];
  generatedData?: WebwrightGeneratedDataSnapshot;
  replayPlan?: WebwrightReplayPlan;
  failureContext?: WebwrightFailureContext;
  pageObjectsMetadata?: WebwrightPageObjectMetadata[];
}

/**
 * Converts our internal test cases and target URL into a structured Webwright
 * exploration task instruction.
 *
 * The resulting instruction is intentionally written as natural language so that
 * a browser-agent can execute it without tight coupling to our internal types.
 */
export class WebwrightTaskBuilder {
  /**
   * Builds a Webwright task from the provided test cases and target URL.
   *
   * @param testCases - The parsed test cases whose flows should be explored.
   * @param targetUrl - The URL the browser agent should navigate to first.
   * @returns A structured WebwrightTask ready for the sidecar runner.
   */
  build(testCases: TestCase[], targetUrl: string): WebwrightTask {
    const focusAreas = this.extractFocusAreas(testCases);
    const instruction = this.buildInstruction(testCases, targetUrl, focusAreas);
    return { instruction, targetUrl, focusAreas };
  }

  buildRepairTask(input: WebwrightRepairTaskInput): WebwrightTask & { failureCategory: WebwrightFailureCategory; failedSpecPath: string; generatedFiles: string[] } {
    const instruction = this.buildRepairInstruction(input);
    return {
      instruction,
      targetUrl: input.targetUrl,
      focusAreas: [input.failureCategory],
      failureCategory: input.failureCategory,
      failedSpecPath: input.failedSpecPath,
      generatedFiles: input.generatedFiles,
      generatedData: input.generatedData,
      replayPlan: input.replayPlan,
      failureContext: input.failureContext,
      pageObjects: input.pageObjectsMetadata,
    };
  }

  private extractFocusAreas(testCases: TestCase[]): string[] {
    const areas = new Set<string>();
    for (const tc of testCases) {
      for (const step of tc.steps ?? []) {
        const target = (step.target ?? '').toLowerCase();
        const action = (step.action ?? '').toLowerCase();
        if (target.includes('username') || target.includes('email') || action.includes('login')) {
          areas.add('login-fields');
        }
        if (target.includes('password')) {
          areas.add('login-fields');
        }
        if (action.includes('login') || target.includes('login') || target.includes('sign in')) {
          areas.add('login-button');
        }
        if (action.includes('add') && (target.includes('cart') || target.includes('product'))) {
          areas.add('add-to-cart-button');
        }
        if (target.includes('cart') || action.includes('cart')) {
          areas.add('cart-badge');
        }
        if (target.includes('checkout') || action.includes('checkout')) {
          areas.add('checkout-flow');
        }
        if (action.includes('navigate') || action.includes('goto') || action.includes('open')) {
          areas.add('navigation');
        }
      }
      for (const result of tc.expectedResults ?? []) {
        const r = result.toLowerCase();
        if (r.includes('error') || r.includes('invalid')) {
          areas.add('error-messages');
        }
        if (r.includes('product') || r.includes('inventory')) {
          areas.add('products-page');
        }
        if (r.includes('cart')) {
          areas.add('cart-badge');
        }
      }
    }
    return [...areas];
  }

  private buildInstruction(testCases: TestCase[], targetUrl: string, focusAreas: string[]): string {
    const caseNames = testCases.map((tc) => `"${tc.name}"`).join(', ');
    const focusList = focusAreas.length > 0 ? focusAreas.join(', ') : 'all interactive elements';
    const stepSummaries = testCases
      .flatMap((tc) => tc.steps ?? [])
      .map((s) => {
        const valueDisplay = s.value ? ` → ${this.redactIfSensitive(s.target, s.value)}` : '';
        return `${s.action}${s.target ? ' ' + s.target : ''}${valueDisplay}`;
      })
      .slice(0, 20)
      .join('; ');

    return (
      `Explore the target website at ${targetUrl}. ` +
      `The following test flows will be automated: ${caseNames}. ` +
      `Key user actions observed in the test cases: ${stepSummaries}. ` +
      `Focus on identifying stable, semantic locators for these areas: ${focusList}. ` +
      `For each focus area, suggest the most robust locator strategy (role, label, data-test attribute) ` +
      `and note which page object the element belongs to. ` +
      `After exploring, return a structured JSON response containing: ` +
      `discoveredPages, recommendedLocators (each with selector, strategy, page, and confidence), ` +
      `recommendedAssertions (each with description, selector, assertionType), ` +
      `and any warnings about unstable or missing elements.`
    );
  }

  private buildRepairInstruction(input: WebwrightRepairTaskInput): string {
    const sanitizedStdout = this.sanitizeLogChunk(input.stdout);
    const sanitizedStderr = this.sanitizeLogChunk(input.stderr);
    const pageObjects = input.pageObjects.length > 0 ? input.pageObjects.join(', ') : 'the generated page objects';
    const replayPlanSummary = input.replayPlan?.steps?.length
      ? `${input.replayPlan.steps.length} deterministic replay step(s)`
      : 'no deterministic replay plan was provided';
    const failureContext = input.failureContext
      ? [
        input.failureContext.failedTestTitle,
        input.failureContext.failedPageObject,
        input.failureContext.failedMethod,
        input.failureContext.failedSelector,
      ].filter(Boolean).join(' | ')
      : 'no failure context was extracted';
    const dataSummary = input.generatedData
      ? `validUser username=${input.generatedData.credentials.validUser.username ? '[REDACTED]' : 'missing'}, inputs=${Object.keys(input.generatedData.inputs).length}`
      : 'no generated test data was extracted';

    return (
      `The generated Playwright test at ${input.failedSpecPath} failed because the failure category was ${input.failureCategory}. ` +
      `Explore the target website at ${input.targetUrl}, reproduce the broken flow using only the approved replay plan, inspect ${pageObjects}, ` +
      `identify stable locator and assertion repairs, validate them against the live page, and return JSON only. ` +
      `Failure summary: ${input.summary}. ` +
      `Relevant stdout: ${sanitizedStdout}. ` +
      `Relevant stderr: ${sanitizedStderr}. ` +
      `Failure context: ${failureContext}. ` +
      `Replay plan: ${replayPlanSummary}. ` +
      `Generated data: ${dataSummary}. ` +
      `Focus on repair suggestions for the generated TypeScript framework only.`
    );
  }

  /** Returns '[REDACTED]' for values associated with credential fields (username/password). */
  private redactIfSensitive(target: string | undefined, value: string): string {
    const t = (target ?? '').toLowerCase();
    if (
      t.includes('password') ||
      t.includes('username') ||
      t.includes('email') ||
      t.includes('credential') ||
      t.includes('apikey') ||
      t.includes('token') ||
      t.includes('secret') ||
      t.includes('auth')
    ) {
      return '[REDACTED]';
    }
    return value;
  }

  private sanitizeLogChunk(value: string): string {
    return this.redactIfSensitive(undefined, value)
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, '******')
      .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED_API_KEY]')
      .slice(0, 1200);
  }
}
