import { test, expect, type Page } from "@playwright/test";
import { PRACTICE_PAGE_URL } from "../utils/urls.js";

test.describe("Visual Regression Tests", () => {
  const takeFormScreenshot = async (page: Page, snapshotName: string | readonly string[]) => {
    const form = page.locator("form");
    await expect(form).toBeVisible();

    await expect(form).toHaveScreenshot(snapshotName, {
      animations: "disabled",
      scale: "css",
      maxDiffPixelRatio: 0.15, // allow 15% pixel difference (for cross-platform CSS rendering variations)
    });
  };

  test.beforeEach(async ({ page }) => {
    // Use a stable viewport to avoid cross-browser layout differences
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(PRACTICE_PAGE_URL);
  });

  test("full page visual snapshot @visual", async ({ page }) => {
    // Wait for the page to be fully loaded and stable
    await page.waitForLoadState("networkidle");

    // Take a full page screenshot and compare against baseline
    await expect(page).toHaveScreenshot("practice-page-full.png", {
      fullPage: true,
      animations: "disabled",
      scale: "css",
      maxDiffPixelRatio: 0.15, // allow 15% pixel difference (for cross-platform CSS rendering variations)
    });
  });

  test("form section visual snapshot @visual", async ({ page }) => {
    await page.waitForLoadState("networkidle");

    // Screenshot only the form element with a fixed height to avoid subpixel
    // layout differences across browsers.
    await takeFormScreenshot(page, "practice-form-section.png");
  });

  test("form with filled data visual snapshot @visual", async ({ page }) => {
    await page.waitForLoadState("networkidle");

    // Fill the form with known data (not random — visual tests need consistency)
    const form = page.locator("form");
    await form.locator('input[name="name"]').first().fill("Kunal Deore");
    await form.locator('input[name="email"]').fill("kunal@example.com");
    await page.locator("#exampleInputPassword1").fill("Secret123!");
    await page.getByLabel("Check me out if you Love IceCreams!").check();
    await page.locator("#exampleFormControlSelect1").selectOption({ label: "Male" });
    await page.locator("#inlineRadio1").check();

    // Screenshot the filled form with a fixed height as well.
    await takeFormScreenshot(page, "practice-form-filled.png");
  });

  test("header visual snapshot @visual", async ({ page }) => {
    await page.waitForLoadState("networkidle");

    // Screenshot the page header area instead of a non-existent navbar on the local fixture.
    const header = page.locator("h1");
    await expect(header).toHaveScreenshot("practice-header.png", {
      animations: "disabled",
      scale: "css",
      maxDiffPixelRatio: 0.15, // allow 15% pixel difference (for cross-platform CSS rendering variations)
    });
  });
});
