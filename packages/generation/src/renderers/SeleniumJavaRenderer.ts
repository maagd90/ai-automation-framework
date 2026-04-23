import { PageSnapshot, GeneratedFile, GeneratedArtifact } from '@locator-agent/core';
import { toPascalCase, toCamelCase } from '@locator-agent/shared';

export class SeleniumJavaRenderer {
  render(snapshot: PageSnapshot, pageName: string): GeneratedArtifact {
    const pageClass = toPascalCase(pageName);
    const files: GeneratedFile[] = [
      this.renderDriverManager(),
      this.renderPageObject(snapshot, pageName, pageClass),
      this.renderTestClass(pageClass, pageName, snapshot.url),
    ];
    return { framework: 'selenium-java', language: 'java', files };
  }

  private renderDriverManager(): GeneratedFile {
    return {
      path: 'src/main/java/framework/core/DriverManager.java',
      content: `package framework.core;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;

public class DriverManager {
    private static WebDriver driver;

    public static WebDriver getDriver() {
        if (driver == null) {
            ChromeOptions options = new ChromeOptions();
            options.addArguments("--headless");
            driver = new ChromeDriver(options);
        }
        return driver;
    }

    public static void quit() {
        if (driver != null) {
            driver.quit();
            driver = null;
        }
    }
}
`,
    };
  }

  private renderPageObject(snapshot: PageSnapshot, _pageName: string, pageClass: string): GeneratedFile {
    const locatorFields = snapshot.elements
      .map(el => `    @FindBy(css = "${el.primaryLocator.value}")\n    private WebElement ${toCamelCase(el.name || el.elementId)};`)
      .join('\n\n');

    return {
      path: `src/main/java/framework/pages/${pageClass}Page.java`,
      content: `package framework.pages;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;
import org.openqa.selenium.support.PageFactory;

public class ${pageClass}Page {
    private WebDriver driver;

${locatorFields}

    public ${pageClass}Page(WebDriver driver) {
        this.driver = driver;
        PageFactory.initElements(driver, this);
    }

    public void navigate() {
        driver.get("${snapshot.url}");
    }
}
`,
    };
  }

  private renderTestClass(pageClass: string, pageName: string, url: string): GeneratedFile {
    return {
      path: `src/test/java/framework/tests/${pageClass}Test.java`,
      content: `package framework.tests;

import framework.core.DriverManager;
import framework.pages.${pageClass}Page;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

public class ${pageClass}Test {

    @Test
    public void testPageLoads() {
        var page = new ${pageClass}Page(DriverManager.getDriver());
        page.navigate();
        assertEquals("${url}", DriverManager.getDriver().getCurrentUrl());
    }

    @AfterAll
    public static void tearDown() {
        DriverManager.quit();
    }
}
`,
    };
  }
}
