import { Page } from 'playwright';
import { AccessibilityNode } from '@ai-locator/core';
import { createLogger } from '@ai-locator/shared';

interface A11yNode {
  role: string;
  name?: string;
  description?: string;
  children?: A11yNode[];
}

export class AccessibilityCollector {
  private readonly logger = createLogger('AccessibilityCollector');

  async collect(page: Page): Promise<AccessibilityNode[]> {
    this.logger.info('Collecting accessibility tree');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snapshot = await (page as any).accessibility.snapshot() as A11yNode | null;
    if (!snapshot) return [];

    const nodes: AccessibilityNode[] = [];
    this.traverse(snapshot, nodes);
    return nodes;
  }

  private traverse(node: A11yNode, results: AccessibilityNode[]): void {
    if (node.role && node.name) {
      results.push({
        role: node.role,
        name: node.name,
        description: node.description,
      });
    }
    if (node.children) {
      for (const child of node.children) {
        this.traverse(child, results);
      }
    }
  }
}
