import type { Page } from 'playwright';
import type { TestStep } from '@ai-agent/shared-types';

export interface McpRecordedAction {
  step: TestStep;
  success: boolean;
  error?: string;
}

/**
 * Playwright MCP-style session adapter that executes JSON steps in a live browser
 * and records actions for code generation.
 */
export class PlaywrightMcpSession {
  private readonly records: McpRecordedAction[] = [];

  constructor(private readonly page: Page) {}

  async executeSteps(steps: TestStep[]): Promise<McpRecordedAction[]> {
    const sorted = steps.slice().sort((a, b) => a.order - b.order);

    for (const step of sorted) {
      try {
        await this.executeStep(step);
        this.records.push({ step, success: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.records.push({ step, success: false, error: message });
        throw err;
      }
    }

    return this.records;
  }

  getRecords(): McpRecordedAction[] {
    return this.records;
  }

  private async executeStep(step: TestStep): Promise<void> {
    switch (step.action) {
      case 'navigate':
        await this.page.goto(step.target ?? '');
        await this.page.waitForLoadState('networkidle');
        return;
      case 'enter':
        await this.page.getByLabel(step.target ?? '').fill(step.value ?? '');
        return;
      case 'click':
        await this.page.getByRole('button', { name: step.target }).click().catch(async () => {
          await this.page.getByText(step.target ?? '').click();
        });
        return;
      case 'verifyVisible':
        await this.page.getByText(step.target ?? '').waitFor({ state: 'visible' });
        return;
      case 'verifyText':
        await this.page.getByText(step.value ?? step.expected ?? '').waitFor({ state: 'visible' });
        return;
      default:
        await this.page.getByText(step.target ?? '').click();
    }
  }
}
