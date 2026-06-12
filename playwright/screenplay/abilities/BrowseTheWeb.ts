import type { Page } from "@playwright/test";

/**
 * Ability: BrowseTheWeb
 * Gives an actor the ability to interact with a web browser.
 * This wraps the Playwright Page object.
 */
export class BrowseTheWeb {
  private constructor(private page: Page) {}

  static using(page: Page): BrowseTheWeb {
    return new BrowseTheWeb(page);
  }

  getPage(): Page {
    return this.page;
  }
}
