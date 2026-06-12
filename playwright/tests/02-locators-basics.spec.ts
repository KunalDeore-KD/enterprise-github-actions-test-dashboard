import { test, expect } from "@playwright/test";
import { PRACTICE_PAGE_URL } from "../utils/urls.js";

test("locators demo (form elements)", async ({ page }) => {
  await page.goto(PRACTICE_PAGE_URL);

  // Scope to the form to avoid picking elements outside it.
  const form = page.locator("form");

  // NAME: there are two input[name="name"] on the page (one is in the two-way binding section).
  // Fix: scope to the form, then pick the first match in the form.
  const nameInput = form.locator('input[name="name"]').first();
  await nameInput.fill("Kunal");
  await expect(nameInput).toHaveValue("Kunal");

  // EMAIL: unique in the form
  const emailInput = form.locator('input[name="email"]');
  await emailInput.fill("kunal@example.com");
  await expect(emailInput).toHaveValue("kunal@example.com");

  // PASSWORD: stable id is best
  const passwordInput = page.locator("#exampleInputPassword1");
  await passwordInput.fill("Secret123!");
  await expect(passwordInput).toHaveValue("Secret123!");

  // CHECKBOX: getByLabel reads like manual steps and is stable when label is linked
  const iceCreamCheckbox = page.getByLabel("Check me out if you Love IceCreams!");
  await iceCreamCheckbox.check();
  await expect(iceCreamCheckbox).toBeChecked();

  // DROPDOWN: stable id
  const genderSelect = page.locator("#exampleFormControlSelect1");
  await genderSelect.selectOption({ label: "Male" });
  await expect(genderSelect).toHaveValue("Male");

  // RADIO: stable id
  const studentRadio = page.locator("#inlineRadio1");
  await studentRadio.check();
  await expect(studentRadio).toBeChecked();

  // DATE: stable name attribute inside the form
  const dobInput = form.locator('input[name="bday"]');
  await dobInput.fill("2000-01-01");
  await expect(dobInput).toHaveValue("2000-01-01");

  // SUBMIT: input type submit (not a <button>)
  const submitButton = form.locator('input[type="submit"][value="Submit"]');
  await submitButton.click();

  // SUCCESS MESSAGE: rendered after submit
  const successAlert = page.locator(".alert-success");
  await expect(successAlert).toBeVisible();
  await expect(successAlert).toContainText("Success");
});
