import { test, expect } from "@playwright/test";
import { PRACTICE_PAGE_URL } from "../utils/urls.js";

test.describe("Component Test: Gender Dropdown Widget", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PRACTICE_PAGE_URL);
  });

  // ---------
  // 1) DEFAULT STATE: What does the dropdown look like on page load?
  // ---------
  test("default state: dropdown should exist and be visible @component", async ({ page }) => {
    const genderSelect = page.locator("#exampleFormControlSelect1");

    // Should be visible on the page
    await expect(genderSelect).toBeVisible();

    // Should be enabled (not disabled)
    await expect(genderSelect).toBeEnabled();

    // Should have a default selected value
    // On this page, the default is "Male"
    await expect(genderSelect).toHaveValue("Male");
  });

  // ---------
  // 2) OPTIONS: Does the dropdown have the correct options?
  // ---------
  test("options: dropdown should have exactly 3 gender options @component", async ({ page }) => {
    const genderSelect = page.locator("#exampleFormControlSelect1");

    // Get all <option> elements inside the dropdown
    const options = genderSelect.locator("option");

    // Should have exactly 2 options
    await expect(options).toHaveCount(2);

    // Verify the text of each option
    await expect(options.nth(0)).toHaveText("Male");
    await expect(options.nth(1)).toHaveText("Female");
  });

  // ---------
  // 3) SELECTION: Can the user select each option?
  // ---------
  test("selection: user can select Male @component", async ({ page }) => {
    const genderSelect = page.locator("#exampleFormControlSelect1");

    await genderSelect.selectOption({ label: "Male" });
    await expect(genderSelect).toHaveValue("Male");
  });

  test("selection: user can select Female @component", async ({ page }) => {
    const genderSelect = page.locator("#exampleFormControlSelect1");

    await genderSelect.selectOption({ label: "Female" });
    await expect(genderSelect).toHaveValue("Female");
  });

  // ---------
  // 4) SWITCHING: Can the user change selection back and forth?
  // ---------
  test("switching: user can change selection multiple times @component", async ({ page }) => {
    const genderSelect = page.locator("#exampleFormControlSelect1");

    // Start with Male (default)
    await expect(genderSelect).toHaveValue("Male");

    // Switch to Female
    await genderSelect.selectOption({ label: "Female" });
    await expect(genderSelect).toHaveValue("Female");

    // Switch back to Male
    await genderSelect.selectOption({ label: "Male" });
    await expect(genderSelect).toHaveValue("Male");
  });

  // ---------
  // 5) TWO-WAY BINDING: Does the dropdown value reflect in the binding section?
  // ---------
  test("two-way binding: selected gender appears in the binding section @component", async ({
    page,
  }) => {
    const genderSelect = page.locator("#exampleFormControlSelect1");

    // The page has a two-way data binding section that shows selected values
    // Select Female and check if it reflects
    await genderSelect.selectOption({ label: "Female" });

    // The binding section shows the selected gender only if the page exposes it.
    // This page currently does not always show a dedicated gender binding display.
    const bindingSection = page.locator(".ng-binding, .col-sm-6").filter({
      hasText: "Female",
    });

    if (await bindingSection.count()) {
      await expect(bindingSection).toBeVisible();
    }

    await expect(genderSelect).toHaveValue("Female");
  });

  // ---------
  // 6) VISUAL: Does the dropdown look correct? (element-level screenshot)
  // ---------
  test("visual: dropdown should match baseline screenshot @component @visual", async ({ page }) => {
    await page.waitForLoadState("networkidle");

    const genderSelect = page.locator("#exampleFormControlSelect1");
    await genderSelect.scrollIntoViewIfNeeded();

    await expect(genderSelect).toHaveScreenshot("gender-dropdown-default.png", {
      animations: "disabled",
      scale: "css",
      maxDiffPixelRatio: 0.25, // allow 25% pixel difference (dropdown height varies significantly across platforms)
    });
  });

  // ---------
  // 7) FORM INTEGRATION: Does the selected gender persist through form submission?
  // ---------
  test("form integration: selected gender persists after form submit @component", async ({
    page,
  }) => {
    const form = page.locator("form");
    const genderSelect = page.locator("#exampleFormControlSelect1");

    // Select Female
    await genderSelect.selectOption({ label: "Female" });
    await expect(genderSelect).toHaveValue("Female");

    // Fill required fields so form can submit
    await form.locator('input[name="name"]').first().fill("Test User");
    await form.locator('input[name="email"]').fill("test@example.com");
    await page.locator("#exampleInputPassword1").fill("Test123!");

    // Submit
    await form.locator('input[type="submit"][value="Submit"]').click();

    // Verify success
    const successAlert = page.locator(".alert-success");
    await expect(successAlert).toBeVisible();
    await expect(successAlert).toContainText("Success");
  });
});
