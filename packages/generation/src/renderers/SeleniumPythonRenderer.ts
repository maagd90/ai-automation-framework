import { PageSnapshot, GeneratedFile, GeneratedArtifact } from '@locator-agent/core';
import { toPascalCase, toSnakeCase } from '@locator-agent/shared';

export class SeleniumPythonRenderer {
  render(snapshot: PageSnapshot, pageName: string): GeneratedArtifact {
    const pageClass = toPascalCase(pageName);
    const snakeName = toSnakeCase(pageName);
    const files: GeneratedFile[] = [
      this.renderPageObject(snapshot, pageClass, snakeName),
      this.renderTestSpec(pageClass, snakeName, snapshot.url),
    ];
    return { framework: 'selenium-python', language: 'python', files };
  }

  private renderPageObject(snapshot: PageSnapshot, pageClass: string, snakeName: string): GeneratedFile {
    const locatorFields = snapshot.elements
      .map(el => `        self.${toSnakeCase(el.name || el.elementId)} = self.driver.find_element(By.CSS_SELECTOR, '${el.primaryLocator.value}')`)
      .join('\n');

    return {
      path: `src/pages/${snakeName}_page.py`,
      content: `from selenium.webdriver.common.by import By

class ${pageClass}Page:
    def __init__(self, driver):
        self.driver = driver
        self._setup_locators()

    def _setup_locators(self):
${locatorFields}

    def navigate(self):
        self.driver.get('${snapshot.url}')
`,
    };
  }

  private renderTestSpec(pageClass: string, snakeName: string, url: string): GeneratedFile {
    return {
      path: `src/tests/test_${snakeName}.py`,
      content: `import pytest
from selenium import webdriver
from pages.${snakeName}_page import ${pageClass}Page

@pytest.fixture
def driver():
    d = webdriver.Chrome()
    yield d
    d.quit()

def test_page_loads(driver):
    page = ${pageClass}Page(driver)
    page.navigate()
    assert driver.current_url == '${url}'
`,
    };
  }
}
