import fs from 'fs';
import path from 'path';
import { parseScreenFingerprint, screenToClassName } from '@ai-agent/agent-core';
import type { TestCase, TestStep } from '@ai-agent/shared-types';

interface LocatorArtifact {
  url?: string;
  elements?: object[];
}

interface ChildArtifact {
  childId: string;
  testCase: TestCase;
  generatedDir: string;
}

export class PomDedupService {
  mergePagesByScreen(children: ChildArtifact[], pagesDir: string): Map<string, string> {
    fs.mkdirSync(pagesDir, { recursive: true });
    const screenGroups = new Map<string, ChildArtifact[]>();

    for (const child of children) {
      const url = this.resolveScreenUrl(child);
      const fp = parseScreenFingerprint(url).key;
      const group = screenGroups.get(fp) ?? [];
      group.push(child);
      screenGroups.set(fp, group);
    }

    const classByChild = new Map<string, string>();

    for (const [, group] of screenGroups) {
      const canonical = group[0];
      const url = this.resolveScreenUrl(canonical);
      const className = `${screenToClassName(url)}Page`;
      const mergedContent = this.mergePageContents(group, className, url);
      fs.writeFileSync(path.join(pagesDir, `${className}.ts`), mergedContent, 'utf8');

      for (const child of group) {
        classByChild.set(child.childId, className);
      }
    }

    return classByChild;
  }

  mergeLocatorsByScreen(children: ChildArtifact[], locatorsDir: string): void {
    fs.mkdirSync(locatorsDir, { recursive: true });
    const screenLocators = new Map<string, object[]>();

    for (const child of children) {
      const locatorsPath = path.join(child.generatedDir, 'locators');
      if (!fs.existsSync(locatorsPath)) continue;
      for (const file of fs.readdirSync(locatorsPath).filter((f) => f.endsWith('.json'))) {
        const raw = JSON.parse(
          fs.readFileSync(path.join(locatorsPath, file), 'utf8'),
        ) as LocatorArtifact;
        const url = raw.url ?? this.resolveScreenUrl(child);
        const key = parseScreenFingerprint(url).key;
        const existing = screenLocators.get(key) ?? [];
        if (Array.isArray(raw.elements)) {
          existing.push(...raw.elements);
        }
        screenLocators.set(key, existing);
      }
    }

    for (const [key, elements] of screenLocators) {
      const fileName = `${key.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.locators.json`;
      fs.writeFileSync(
        path.join(locatorsDir, fileName),
        JSON.stringify({ schemaVersion: '1.0.0', url: key, elements }, null, 2),
      );
    }
  }

  private resolveScreenUrl(child: ChildArtifact): string {
    const locatorsDir = path.join(child.generatedDir, 'locators');
    if (fs.existsSync(locatorsDir)) {
      for (const file of fs.readdirSync(locatorsDir).filter((f) => f.endsWith('.json'))) {
        const raw = JSON.parse(
          fs.readFileSync(path.join(locatorsDir, file), 'utf8'),
        ) as LocatorArtifact;
        if (raw.url) return raw.url;
      }
    }
    const nav = child.testCase.steps.find((s: TestStep) => s.action === 'navigate');
    return nav?.target ?? 'https://unknown';
  }

  private mergePageContents(group: ChildArtifact[], className: string, url: string): string {
    const methods = new Map<string, string>();

    for (const child of group) {
      const pagesDir = path.join(child.generatedDir, 'pages');
      if (!fs.existsSync(pagesDir)) continue;
      for (const file of fs.readdirSync(pagesDir).filter((f) => f.endsWith('.ts'))) {
        const content = fs.readFileSync(path.join(pagesDir, file), 'utf8');
        for (const match of content.matchAll(/async (\w+)\([^)]*\): Promise<void> \{[\s\S]*?\n  \}/g)) {
          const full = match[0];
          const name = match[1];
          if (!methods.has(name)) methods.set(name, full);
        }
      }
    }

    const methodBlock = Array.from(methods.values()).join('\n\n');
    return `import { type Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class ${className} extends BasePage {
  constructor(page: Page) {
    super(page);
  }

${methodBlock}

  async goto(): Promise<void> {
    await super.goto(${JSON.stringify(url)});
  }
}
`;
  }
}
