import { PageSnapshot, GeneratedFile, GeneratedArtifact } from '@locator-agent/core';
import { toSnakeCase, toPascalCase } from '@locator-agent/shared';

export class PlaywrightPythonRenderer {
  render(snapshot: PageSnapshot, pageName: string): GeneratedArtifact {
    const pageClass = toPascalCase(pageName);
    const snakeName = toSnakeCase(pageName);
    const files: GeneratedFile[] = [
      this.renderPageObject(snapshot, pageName, pageClass, snakeName),
      this.renderTestSpec(pageClass, snakeName, snapshot.url),
    ];
    return { framework: 'playwright-python', language: 'python', files };
  }

  private renderPageObject(snapshot: PageSnapshot, _pageName: string, pageClass: string, snakeName: string): GeneratedFile {
    const locatorFields = snapshot.elements
      .map(el => `        self.${toSnakeCase(el.name || el.elementId)} = page.locator('${el.primaryLocator.value}')`)
      .join('\n');

    return {
      path: `src/pages/${snakeName}_page.py`,
      content: `from playwright.sync_api import Page

class ${pageClass}Page:
    def __init__(self, page: Page):
        self.page = page
${locatorFields}

    def goto(self):
        self.page.goto('${snapshot.url}')
        self.page.wait_for_load_state('networkidle')
`,
    };
  }

  private renderTestSpec(pageClass: string, snakeName: string, url: string): GeneratedFile {
    return {
      path: `src/tests/test_${snakeName}.py`,
      content: `import pytest
from playwright.sync_api import Page
from pages.${snakeName}_page import ${pageClass}Page

def test_page_loads(page: Page):
    page_obj = ${pageClass}Page(page)
    page_obj.goto()
    assert page.url == '${url}'
`,
    };
  }
}
