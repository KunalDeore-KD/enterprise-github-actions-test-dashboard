import { test, expect } from "@playwright/test";
import { PRACTICE_PAGE_URL } from "../utils/urls.js";

test("Phase 3.7 - waits & timing on AngularPractice", async ({ page }) => {
  // 1) Navigate and wait for page to be fully loaded
  await page.goto(PRACTICE_PAGE_URL);
  await page.waitForLoadState("domcontentloaded");

  const form = page.locator("form");

  // ---------
  // 2) Auto-wait in action: fill() automatically waits for the input to be ready
  // ---------
  const nameInput = form.locator('input[name="name"]').first();
  await nameInput.fill("Kunal");
  await expect(nameInput).toHaveValue("Kunal");

  // ---------
  // 3) Trigger validation and use waitFor() to wait for the message
  // ---------
  await nameInput.clear();
  await nameInput.focus();
  await nameInput.blur();

  // Wait explicitly for the validation message to appear
  const nameRequiredAlert = form.getByText("Name is required");
  await nameRequiredAlert.waitFor({ state: "visible" });
  await expect(nameRequiredAlert).toBeVisible();

  // Fix the name and wait for validation message to disappear
  await nameInput.fill("Kunal Fixed");
  await nameRequiredAlert.waitFor({ state: "hidden" });
  await expect(nameRequiredAlert).toBeHidden();

  // ---------
  // 4) Assertion-based wait: expect auto-retries until condition is met
  // ---------
  const iceCreamCheckbox = page.getByLabel("Check me out if you Love IceCreams!");
  await iceCreamCheckbox.check();
  await expect(iceCreamCheckbox).toBeChecked();

  // ---------
  // 5) Fill remaining fields (auto-wait handles timing)
  // ---------
  const emailInput = form.locator('input[name="email"]');
  await emailInput.fill("kunal@example.com");

  const passwordInput = page.locator("#exampleInputPassword1");
  await passwordInput.fill("Secret123!");

  const genderSelect = page.locator("#exampleFormControlSelect1");
  await genderSelect.selectOption({ label: "Male" });

  const studentRadio = page.locator("#inlineRadio1");
  await studentRadio.check();

  const dobInput = form.locator('input[name="bday"]');
  await dobInput.fill("2000-01-01");

  // ---------
  // 6) Submit and wait for success message using assertion-based wait
  // ---------
  const submitButton = form.locator('input[type="submit"][value="Submit"]');
  await submitButton.click();

  // The success alert appears dynamically after submit.
  // expect().toBeVisible() auto-retries until it appears (or times out).
  // No need for waitForTimeout here.
  const successAlert = page.locator(".alert-success");
  await expect(successAlert).toBeVisible();
  await expect(successAlert).toContainText("Success");

  // ---------
  // 7) Navigate to Shop page and use waitForURL()
  // ---------
  const shopLink = page.getByRole("link", { name: "Shop" });

  // Attach the URL wait before clicking so we do not miss the navigation event.
  await Promise.all([
    page.waitForURL("**/shop.html", {
      waitUntil: "domcontentloaded",
    }),
    shopLink.click(),
  ]);

  // Now we can safely assert we're on the shop page.
  await expect(page).toHaveURL(/shop/);
});
