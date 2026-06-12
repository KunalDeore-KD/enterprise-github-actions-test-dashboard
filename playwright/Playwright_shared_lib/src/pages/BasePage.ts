import type { Locator, Page } from "playwright";

type Buffer = any;

/**
 * BasePage: A generic page object that any project can extend.
 * Contains common actions that every page needs.
 */
export class BasePage {
  constructor(protected page: Page) {}

  /** Navigate to a URL */
  async goto(url: string): Promise<void> {
    await this.page.goto(url);
  }

  /** Get the current page title */
  async getTitle(): Promise<string> {
    return this.page.title();
  }

  /** Get the current URL */
  getUrl(): string {
    return this.page.url();
  }

  /** Wait for a locator to be visible */
  async waitForVisible(locator: Locator, timeout = 10000): Promise<void> {
    await locator.waitFor({ state: "visible", timeout });
  }

  /** Wait for a locator to be hidden */
  async waitForHidden(locator: Locator, timeout = 10000): Promise<void> {
    await locator.waitFor({ state: "hidden", timeout });
  }

  /** Fill an input and verify the value */
  async fillAndVerify(locator: Locator, value: string): Promise<void> {
    await locator.fill(value);
    const actualValue = await locator.inputValue();
    if (actualValue !== value) {
      throw new Error(`Expected input value to be "${value}", but got "${actualValue}".`);
    }
  }

  /** Click and wait for navigation */
  async clickAndWaitForNavigation(locator: Locator): Promise<void> {
    await Promise.all([this.page.waitForLoadState("networkidle"), locator.click()]);
  }

  /** Take a screenshot with a descriptive name */
  async takeScreenshot(name: string): Promise<Buffer> {
    return this.page.screenshot({
      path: `screenshots/${name}-${Date.now()}.png`,
      fullPage: true,
    });
  }

  /** Scroll to the bottom of the page */
  async scrollToBottom(): Promise<void> {
    await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  }

  /** Scroll to a specific element */
  async scrollToElement(locator: Locator): Promise<void> {
    await locator.scrollIntoViewIfNeeded();
  }

  /** Get all text content from a list of elements */
  async getAllTexts(locator: Locator): Promise<string[]> {
    return locator.allTextContents();
  }

  /** Check if an element exists (without failing) */
  async exists(locator: Locator): Promise<boolean> {
    return (await locator.count()) > 0;
  }
}
