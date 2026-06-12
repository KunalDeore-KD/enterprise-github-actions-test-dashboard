import { test, expect } from "@playwright/test";
import { PRACTICE_PAGE_URL } from "../utils/urls.js";

test.describe("Flaky demo", () => {
  // Global config uses retries only in CI; this file needs retries locally too.
  test.describe.configure({ retries: 1 });

  test("fails on first attempt then passes on retry @regression", async ({ page }) => {
    await page.goto(PRACTICE_PAGE_URL);

    if (test.info().retry === 0) {
      await expect(page.locator("#this-element-does-not-exist-for-flaky-demo")).toBeVisible({ timeout: 500 });
    }

    await expect(page.locator("form")).toBeVisible();
  });

  test("intermittent assertion recovers on retry @regression", async () => {
    if (test.info().retry === 0) {
      expect(1 + 1).toBe(3);
    }

    expect(2 + 2).toBe(4);
  });
});
