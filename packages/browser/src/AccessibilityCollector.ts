import { Page } from 'playwright';
import { AccessibilityNode } from '@locator-agent/core';
import { Logger } from '@locator-agent/shared';

type A11yPage = Page & { accessibility?: { snapshot: () => Promise<{ role: string; name?: string; description?: string; children?: unknown[] } | null> } };

export class AccessibilityCollector {
  private readonly logger = new Logger('AccessibilityCollector');

  async collect(page: Page): Promise<AccessibilityNode[]> {
    this.logger.info('Collecting accessibility tree');
    const a11yPage = page as A11yPage;
    if (!a11yPage.accessibility) return [];
    const snapshot = await a11yPage.accessibility.snapshot();
    if (!snapshot) return [];
    return this.flattenTree(snapshot);
  }

  private flattenTree(node: { role: string; name?: string; description?: string; children?: unknown[] }): AccessibilityNode[] {
    const result: AccessibilityNode[] = [];
    result.push({ role: node.role, name: node.name ?? '', description: node.description });
    for (const child of node.children ?? []) {
      result.push(...this.flattenTree(child as { role: string; name?: string; description?: string; children?: unknown[] }));
    }
    return result;
  }
}
