import { test, expect } from "@playwright/test";
import { PRACTICE_PAGE_URL } from "../utils/urls.js";

test("Phase 3.5 - actions & interactions on AngularPractice form", async ({ page }) => {
  await page.goto(PRACTICE_PAGE_URL);

  const form = page.locator("form");

  // ---------
  // 1) fill() - type text into Name input (clears first, then types)
  // ---------
  const nameInput = form.locator('input[name="name"]').first();
  await nameInput.fill("Kunal Automation");
  await expect(nameInput).toHaveValue("Kunal Automation");

  // ---------
  // 2) clear() + fill() - clear existing text, then type new text
  // ---------
  await nameInput.clear();
  await expect(nameInput).toHaveValue("");
  await nameInput.fill("Kunal Updated");
  await expect(nameInput).toHaveValue("Kunal Updated");

  // ---------
  // 3) fill() on email input
  // ---------
  const emailInput = form.locator('input[name="email"]');
  await emailInput.fill("kunal@example.com");
  await expect(emailInput).toHaveValue("kunal@example.com");

  // ---------
  // 4) fill() on password input
  // ---------
  const passwordInput = page.locator("#exampleInputPassword1");
  await passwordInput.fill("Secret123!");
  await expect(passwordInput).toHaveValue("Secret123!");

  // ---------
  // 5) check() - checkbox (idempotent: always results in checked)
  // ---------
  const iceCreamCheckbox = page.getByLabel("Check me out if you Love IceCreams!");
  await iceCreamCheckbox.check();
  await expect(iceCreamCheckbox).toBeChecked();

  // Calling check() again does nothing (already checked) - safe and idempotent
  await iceCreamCheckbox.check();
  await expect(iceCreamCheckbox).toBeChecked();

  // ---------
  // 6) uncheck() - uncheck the checkbox
  // ---------
  await iceCreamCheckbox.uncheck();
  await expect(iceCreamCheckbox).not.toBeChecked();

  // ---------
  // 7) selectOption() - dropdown selection by visible label
  // ---------
  const genderSelect = page.locator("#exampleFormControlSelect1");
  await genderSelect.selectOption({ label: "Female" });
  await expect(genderSelect).toHaveValue("Female");

  // Change selection to Male
  await genderSelect.selectOption({ label: "Male" });
  await expect(genderSelect).toHaveValue("Male");

  // ---------
  // 8) check() - radio button (Student)
  // ---------
  const studentRadio = page.locator("#inlineRadio1");
  await studentRadio.check();
  await expect(studentRadio).toBeChecked();

  // Switch to Employed radio
  const employedRadio = page.locator("label[for='inlineRadio2']");
  await employedRadio.scrollIntoViewIfNeeded();
  await employedRadio.click();
  await expect(page.locator("#inlineRadio2")).toBeChecked();
  // Student should now be unchecked (radios are mutually exclusive)
  await expect(studentRadio).not.toBeChecked();

  // ---------
  // 9) fill() - date input
  // ---------
  const dobInput = form.locator('input[name="bday"]');
  await dobInput.fill("2000-01-01");
  await expect(dobInput).toHaveValue("2000-01-01");

  // ---------
  // 10) focus() + blur() - trigger validation by focusing and leaving
  // ---------
  // Clear name to trigger "Name is required" validation
  await nameInput.clear();
  await nameInput.focus();
  await nameInput.blur();

  const nameRequiredAlert = form.getByText("Name is required");
  await expect(nameRequiredAlert).toBeVisible();

  // Fix it
  await nameInput.fill("Kunal Fixed");
  await expect(nameRequiredAlert).toBeHidden();

  // ---------
  // 11) press() - press Enter/Tab via keyboard
  // ---------
  // We can press Tab to move focus to the next field
  await nameInput.press("Tab");

  // ---------
  // 12) click() - submit button
  // ---------
  const submitButton = form.locator('input[type="submit"][value="Submit"]');
  await submitButton.click();

  // ---------
  // 13) Verify success after submit
  // ---------
  const successAlert = page.locator(".alert-success");
  await expect(successAlert).toBeVisible();
  await expect(successAlert).toContainText("Success");
});
