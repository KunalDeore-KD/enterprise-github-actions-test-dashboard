import { test, expect } from "@playwright/test";
import { PRACTICE_PAGE_URL } from "../utils/urls.js";

test("Phase 3.4 - assertions & validations on AngularPractice form", async ({ page }) => {
  await page.goto(PRACTICE_PAGE_URL);

  // Scope everything to the main form
  const form = page.locator("form");

  // ---------
  // 1) Name required validation (negative case)
  // ---------
  const nameInput = form.locator('input[name="name"]').first();

  // On initial load, validation messages can be present depending on touched state.
  // We'll force a clear validation by: focus -> blur without entering value.
  await nameInput.click();
  await page.keyboard.press("Tab");

  // The HTML shows: <div class="alert alert-danger">Name is required</div>
  // We'll assert it becomes visible (or stays visible).
  const nameRequiredAlert = form.getByText("Name is required");
  await expect(nameRequiredAlert).toBeVisible();

  // Now fix it by entering a valid name (>= 2 chars)
  await nameInput.fill("Kunal");
  await expect(nameInput).toHaveValue("Kunal");

  // After fixing the input, typically the validation message should disappear.
  // On this page it usually hides once the field becomes valid.
  await expect(nameRequiredAlert).toBeHidden();

  // ---------
  // 2) Checkbox state assertion
  // ---------
  const iceCreamCheckbox = page.getByLabel("Check me out if you Love IceCreams!");
  await expect(iceCreamCheckbox).not.toBeChecked();
  await iceCreamCheckbox.check();
  await expect(iceCreamCheckbox).toBeChecked();

  // ---------
  // 3) Disabled radio assertion (Entrepreneur disabled)
  // ---------
  const entrepreneurRadio = page.locator("#inlineRadio3");
  await expect(entrepreneurRadio).toBeDisabled();

  // ---------
  // 4) Submit and success message assertion
  // ---------
  const submitButton = form.locator('input[type="submit"][value="Submit"]');
  await submitButton.click();

  const successAlert = page.locator(".alert-success");
  await expect(successAlert).toBeVisible();
  await expect(successAlert).toContainText("Success");
});
