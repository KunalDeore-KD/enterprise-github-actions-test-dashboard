import { test, expect } from "@playwright/test";
import { PRACTICE_PAGE_URL } from "../utils/urls.js";

test("test", async ({ page }) => {
  await page.goto(PRACTICE_PAGE_URL);
  await page.locator('form input[name="name"]').click();
  await page.locator('form input[name="name"]').fill("Kunal Test");
  await page.locator('input[name="email"]').click();
  await page.locator('input[name="email"]').fill("kunaltester@example.com");
  await page.getByRole("textbox", { name: "Password" }).click();
  await page.getByRole("textbox", { name: "Password" }).fill("Test#123");
  await page.getByRole("checkbox", { name: "Check me out if you Love" }).check();
  await page.getByLabel("Gender").selectOption("Female");
  await page.getByLabel("Gender").selectOption("Male");
  await page.getByRole("radio", { name: "Student" }).check();
  const employedRadioLabel = page.locator("label[for='inlineRadio2']");
  await employedRadioLabel.scrollIntoViewIfNeeded();
  await employedRadioLabel.click();
  await page.locator('input[name="bday"]').fill("1999-07-12");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.locator("form-comp")).toContainText(
    "× Success! The Form has been submitted successfully!.",
  );
});
