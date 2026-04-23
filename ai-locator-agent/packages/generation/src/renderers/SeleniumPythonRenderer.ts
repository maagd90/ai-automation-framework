import { PageSnapshot, GeneratedArtifact } from '@ai-locator/core';

export class SeleniumPythonRenderer {
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
    return `from selenium.webdriver.remote.webdriver import WebDriver


class BasePage:
    def __init__(self, driver: WebDriver):
        self.driver = driver

    def navigate(self, url: str) -> None:
        self.driver.get(url)
`;
  }

  private renderPage(snapshot: PageSnapshot, className: string): string {
    const props = snapshot.elements.map((el) => {
      const propName = (el.name || el.elementId).toLowerCase().replace(/[^a-z0-9]/g, '_');
      return `    @property
    def ${propName}(self):
        return self.driver.find_element("css selector", '${el.primaryLocator.value}')`;
    }).join('\n\n');

    return `from selenium.webdriver.remote.webdriver import WebDriver
from pages.base_page import BasePage


class ${className}Page(BasePage):
    def __init__(self, driver: WebDriver):
        super().__init__(driver)

${props}
`;
  }

  private renderTest(className: string, snakeName: string): string {
    return `import pytest
from selenium import webdriver
from pages.${snakeName}_page import ${className}Page


@pytest.fixture
def driver():
    d = webdriver.Chrome()
    yield d
    d.quit()


def test_page_loads(driver):
    page = ${className}Page(driver)
    page.navigate("/")
    # Add assertions here
`;
  }
}
