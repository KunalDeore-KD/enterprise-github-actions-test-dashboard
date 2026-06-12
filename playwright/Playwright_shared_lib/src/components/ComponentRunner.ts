import type { Page } from "@playwright/test";

/**
 * ComponentRunner: Mounts isolated HTML components in a Playwright page.
 * Two mount strategies:
 * 1. mount(html) — inline HTML string
 * 2. mountFile(path) — load from an HTML fixture file
 */
export class ComponentRunner {
  constructor(private page: Page) {}

  /** Mount a raw HTML string as an isolated component */
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
              href="https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/css/bootstrap.min.css" />
        ${styles}
      </head>
      <body>
        <div id="component-root" class="container p-4">
          ${html}
        </div>
      </body>
      </html>
    `);

    await this.page.waitForSelector("#component-root");
  }

  /** Mount an HTML file from a fixture path */
  async mountFile(filePath: string): Promise<void> {
    await this.page.goto(`file://${process.cwd()}/${filePath}`);
  }

  /** Get the root element */
  getRoot() {
    return this.page.locator("#component-root");
  }
}
