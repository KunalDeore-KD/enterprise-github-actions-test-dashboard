import type { Page } from "@playwright/test";

/**
 * ComponentRunner: Mounts isolated HTML components in a Playwright page.
 *
 * Instead of navigating to a full application, this renders ONLY the component
 * you want to test — making tests faster and more focused.
 *
 * Usage:
 *   const runner = new ComponentRunner(page);
 *   await runner.mount('<button id="btn">Click me</button>');
 *   await page.locator("#btn").click();
 */
export class ComponentRunner {
  constructor(private page: Page) {}

  /**
   * Mount a raw HTML string as an isolated component.
   * Wraps it in a basic HTML document with optional CSS.
   */
  async mount(html: string, css?: string): Promise<void> {
    const styles = css ? `<style>${css}</style>` : "";

    await this.page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Component Test</title>
        <link rel="stylesheet"
              href="<https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/css/bootstrap.min.css">>
        ${styles}
      </head>
      <body>
        <div id="component-root" class="container p-4">
          ${html}
        </div>
        <script src="<https://code.jquery.com/jquery-3.7.1.min.js"></script>>
        <script src="<https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/js/bootstrap.bundle.min.js"></script>>
      </body>
      </html>
    `);

    // Wait for the component to be fully rendered
    await this.page.waitForSelector("#component-root");
  }

  /**
   * Mount an HTML file from the components/fixtures folder.
   */
  async mountFile(filePath: string): Promise<void> {
    await this.page.goto(`file://${process.cwd()}/${filePath}`);
  }

  /**
   * Get the root element of the mounted component.
   */
  getRoot() {
    return this.page.locator("#component-root");
  }
}
