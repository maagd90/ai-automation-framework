import { PageSnapshot, GeneratedArtifact } from '@ai-locator/core';

export class SeleniumJavaRenderer {
  render(snapshot: PageSnapshot, name: string): GeneratedArtifact {
    const className = name.split(/[-_\s]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
    const pkg = 'com.example.tests';
    const basePath = `src/test/java/${pkg.replace(/\./g, '/')}`;

    return {
      files: [
        { path: `${basePath}/core/DriverManager.java`, content: this.renderDriverManager(pkg) },
        { path: `${basePath}/pages/base/BasePage.java`, content: this.renderBasePage(pkg) },
        { path: `${basePath}/pages/${className}Page.java`, content: this.renderPage(snapshot, pkg, className) },
        { path: `${basePath}/tests/${className}Test.java`, content: this.renderTest(pkg, className) },
      ],
    };
  }

  private renderDriverManager(pkg: string): string {
    return `package ${pkg}.core;

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
`;
  }

  private renderBasePage(pkg: string): string {
    return `package ${pkg}.pages.base;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.PageFactory;

public abstract class BasePage {
    protected WebDriver driver;

    public BasePage(WebDriver driver) {
        this.driver = driver;
        PageFactory.initElements(driver, this);
    }

    public void navigate(String url) {
        driver.get(url);
    }
}
`;
  }

  private renderPage(snapshot: PageSnapshot, pkg: string, className: string): string {
    const fields = snapshot.elements.map((el) => {
      const fieldName = (el.name || el.elementId).replace(/[^a-zA-Z0-9]/g, '');
      return `    @FindBy(css = "${el.primaryLocator.value}")
    private WebElement ${fieldName};

    public WebElement get${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}() {
        return ${fieldName};
    }`;
    }).join('\n\n');

    return `package ${pkg}.pages;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;
import ${pkg}.pages.base.BasePage;

public class ${className}Page extends BasePage {
    public ${className}Page(WebDriver driver) {
        super(driver);
    }

${fields}
}
`;
  }

  private renderTest(pkg: string, className: string): string {
    return `package ${pkg}.tests;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openqa.selenium.WebDriver;
import ${pkg}.core.DriverManager;
import ${pkg}.pages.${className}Page;

public class ${className}Test {
    private WebDriver driver;
    private ${className}Page page;

    @Before
    public void setUp() {
        driver = DriverManager.getDriver();
        page = new ${className}Page(driver);
    }

    @Test
    public void testPageLoads() {
        page.navigate("/");
        // Add assertions here
    }

    @After
    public void tearDown() {
        DriverManager.quit();
    }
}
`;
  }
}
