import { PageSnapshot, GeneratedArtifact } from '@ai-locator/core';

export class PlaywrightPythonRenderer {
  render(snapshot: PageSnapshot, name: string): GeneratedArtifact {
    const snakeName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const className = name.split(/[-_\s]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');

    return {
      files: [
        { path: 'pages/base_page.py', content: this.renderBasePage() },
        { path: `pages/${snakeName}_page.py`, content: this.renderPage(snapshot, className) },
        { path: `tests/test_${snakeName}.py`, content: this.renderTest(className, snakeName) },
      ],
    };
  }

  private renderBasePage(): string {
    return `from playwright.sync_api import Page


class BasePage:
    def __init__(self, page: Page):
        self.page = page

    def navigate(self, url: str) -> None:
        self.page.goto(url)
        self.page.wait_for_load_state("networkidle")
`;
  }

  private renderPage(snapshot: PageSnapshot, className: string): string {
    const props = snapshot.elements.map((el) => {
      const propName = (el.name || el.elementId).toLowerCase().replace(/[^a-z0-9]/g, '_');
      return `    @property
    def ${propName}(self):
        return self.page.locator('${el.primaryLocator.value}')`;
    }).join('\n\n');

    return `from playwright.sync_api import Page
from pages.base_page import BasePage


class ${className}Page(BasePage):
    def __init__(self, page: Page):
        super().__init__(page)

${props}
`;
  }

  private renderTest(className: string, snakeName: string): string {
    return `import pytest
from playwright.sync_api import Page
from pages.${snakeName}_page import ${className}Page


def test_page_loads(page: Page):
    page_obj = ${className}Page(page)
    page_obj.navigate("/")
    # Add assertions here
`;
  }
}
