import { test, expect } from "@playwright/test";
import { PRACTICE_PAGE_URL } from "../utils/urls.js";

test.describe("Failure demo", () => {
  test("expects a missing element @regression", async ({ page }) => {
    await page.goto(PRACTICE_PAGE_URL);
    await expect(page.locator("#intentional-failure-missing-element")).toBeVisible();
  });

  test("asserts the wrong page title @regression", async ({ page }) => {
    await page.goto(PRACTICE_PAGE_URL);
    await expect(page).toHaveTitle("This Title Is Wrong On Purpose");
  });
});
