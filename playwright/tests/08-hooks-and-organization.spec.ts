import { test, expect } from "@playwright/test";
import { PracticePage } from "../pages/PracticePage.js";
import { PRACTICE_PAGE_URL } from "../utils/urls.js";

// --------------------
// SUITE-LEVEL HOOKS (run once for the entire file)
// --------------------

test.beforeAll(async () => {
  console.log("=== Starting AngularPractice Test Suite ===");
});

test.afterAll(async () => {
  console.log("=== Finished AngularPractice Test Suite ===");
});

// --------------------
// GROUP 1: Form Tests
// --------------------

test.describe("Form Tests", () => {
  let practicePage: PracticePage;

  // This beforeEach runs ONLY before tests inside "Form Tests"
  test.beforeEach(async ({ page }) => {
    practicePage = new PracticePage(page);
    await practicePage.goto();
  });

  test("fill form and verify success @smoke", async ({ page }) => {
    await practicePage.fillForm({
      name: "Kunal",
      email: "kunal@example.com",
      password: "Secret123!",
      gender: "Male",
      dob: "2000-01-01",
      loveIceCream: true,
      employment: "student",
    });

    await practicePage.submit();

    await expect(practicePage.successAlert).toBeVisible();
    await expect(practicePage.successAlert).toContainText("Success");
  });

  test("verify name is required validation @regression", async ({ page }) => {
    const form = page.locator("form");
    const nameInput = form.locator('input[name="name"]').first();

    await nameInput.click();
    await nameInput.blur();

    const nameRequiredAlert = form.getByText("Name is required");
    await expect(nameRequiredAlert).toBeVisible();

    // Fix the name
    await nameInput.fill("Kunal");
    await expect(nameRequiredAlert).toBeHidden();
  });

  test("verify checkbox can be checked and unchecked @regression", async () => {
    await expect(practicePage.iceCreamCheckbox).not.toBeChecked();
    await practicePage.iceCreamCheckbox.check();
    await expect(practicePage.iceCreamCheckbox).toBeChecked();
    await practicePage.iceCreamCheckbox.uncheck();
    await expect(practicePage.iceCreamCheckbox).not.toBeChecked();
  });
});

// --------------------
// GROUP 2: Disabled Elements Tests
// --------------------

test.describe("Disabled Elements Tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PRACTICE_PAGE_URL);
  });

  test("entrepreneur radio should be disabled @smoke", async ({ page }) => {
    const entrepreneurRadio = page.locator("#inlineRadio3");
    await expect(entrepreneurRadio).toBeDisabled();
  });

  // Example of test.skip: skip a test that is not ready yet
  test.skip("verify disabled dropdown option @regression", async ({ page }) => {
    // This test is skipped because the feature doesn't exist on this page yet
    // It will show as "skipped" in reports
  });
});

// --------------------
// GROUP 3: Navigation Tests
// --------------------

test.describe("Navigation Tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PRACTICE_PAGE_URL);
  });

  test("navigate to Shop page @smoke", async ({ page }) => {
    const shopLink = page.getByRole("link", { name: "Shop" });

    // Attach the URL wait before clicking to avoid racing the route change.
    await Promise.all([
      page.waitForURL("**/shop.html", {
        waitUntil: "domcontentloaded",
      }),
      shopLink.click(),
    ]);

    await expect(page).toHaveURL(/shop/);
  });
});
