// We import the 'test' and 'expect' functions from Playwright Test
// Testing pre-commit hook
import { test, expect } from "@playwright/test";

// This defines a test case with a title and an async function body
test("should open Playwright website and verify the page title", async ({ page }) => {
  // 'page' is like a browser tab/window provided by Playwright
  // We use 'await' because going to a URL is an async operation

  // Step 1: Navigate to the Playwright homepage
  await page.goto("https://playwright.dev/");

  // Step 2: Get the page title and verify it
  // 'toHaveTitle' will wait until the page title matches the expected value
  await expect(page).toHaveTitle(/Playwright/);

  // If the title contains "Playwright", this assertion passes
  // If not, the test will fail and Playwright will report it
});
