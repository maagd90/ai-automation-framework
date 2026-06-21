import fs from 'fs';
import path from 'path';
import type { TestStep } from '@ai-agent/shared-types';

export interface SharedFlow {
  name: string;
  steps: TestStep[];
  usedByCaseIds: string[];
}

export class FixtureGenerator {
  write(fixturesDir: string, flows: SharedFlow[]): void {
    if (flows.length === 0) return;
    fs.mkdirSync(fixturesDir, { recursive: true });

    const fnBodies = flows.map((flow) => this.renderFlowFunction(flow)).join('\n\n');
    const content = `import { type Page } from '@playwright/test';

${fnBodies}
`;
    fs.writeFileSync(path.join(fixturesDir, 'shared-flows.fixture.ts'), content, 'utf8');
  }

  private renderFlowFunction(flow: SharedFlow): string {
    const fnName = flow.name;
    const lines: string[] = [];
    for (const step of flow.steps) {
      switch (step.action) {
        case 'navigate':
          lines.push(`  await page.goto(${JSON.stringify(step.target ?? '')});`);
          lines.push(`  await page.waitForLoadState('networkidle');`);
          break;
        case 'enter':
          lines.push(
            `  await page.getByLabel(${JSON.stringify(step.target ?? '')}).fill(${JSON.stringify(step.value ?? '')});`,
          );
          break;
        case 'click':
          lines.push(
            `  await page.getByRole('button', { name: ${JSON.stringify(step.target ?? '')} }).click();`,
          );
          break;
        default:
          break;
      }
    }
    return `export async function ${fnName}(page: Page): Promise<void> {\n${lines.join('\n')}\n}`;
  }

  detectSharedFlows(
    cases: Array<{ id: string; steps: TestStep[] }>,
    minPrefixLength = 2,
    minCases = 2,
  ): SharedFlow[] {
    const flows: SharedFlow[] = [];
    const prefixMap = new Map<string, { steps: TestStep[]; ids: string[] }>();

    for (const tc of cases) {
      const sorted = tc.steps.slice().sort((a, b) => a.order - b.order);
      for (let len = sorted.length; len >= minPrefixLength; len--) {
        const prefix = sorted.slice(0, len);
        const key = prefix.map((s) => `${s.action}:${s.target}:${s.value ?? ''}`).join('|');
        const entry = prefixMap.get(key) ?? { steps: prefix, ids: [] };
        if (!entry.ids.includes(tc.id)) entry.ids.push(tc.id);
        prefixMap.set(key, entry);
      }
    }

    for (const [key, entry] of prefixMap.entries()) {
      if (entry.ids.length >= minCases) {
        const hash = key.split('|').slice(0, 2).join('_').replace(/[^a-z0-9]/gi, '').slice(0, 24);
        flows.push({
          name: `sharedFlow_${hash || 'setup'}`,
          steps: entry.steps,
          usedByCaseIds: entry.ids,
        });
      }
    }

    return flows.slice(0, 5);
  }
}
