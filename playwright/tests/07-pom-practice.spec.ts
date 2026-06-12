import { test, expect } from "@playwright/test";
import { PracticePage } from "../pages/PracticePage.js";

test("Phase 3.8 - POM: fill form and verify success", async ({ page }) => {
  // Create an instance of PracticePage
  const practicePage = new PracticePage(page);

  // Navigate to the page
  await practicePage.goto();

  // Fill the form using the page object method
  await practicePage.fillForm({
    name: "Kunal",
    email: "kunal@example.com",
    password: "Secret123!",
    gender: "Male",
    dob: "2000-01-01",
    loveIceCream: true,
    employment: "student",
  });

  // Verify form values (assertions stay in the test)
  await expect(practicePage.nameInput).toHaveValue("Kunal");
  await expect(practicePage.emailInput).toHaveValue("kunal@example.com");
  await expect(practicePage.passwordInput).toHaveValue("Secret123!");
  await expect(practicePage.iceCreamCheckbox).toBeChecked();
  await expect(practicePage.genderSelect).toHaveValue("Male");
  await expect(practicePage.studentRadio).toBeChecked();

  // Submit the form
  await practicePage.submit();

  // Verify success message (assertion in the test, not in the page class)
  await expect(practicePage.successAlert).toBeVisible();
  await expect(practicePage.successAlert).toContainText("Success");
});

test("Phase 3.8 - POM: verify entrepreneur radio is disabled", async ({ page }) => {
  const practicePage = new PracticePage(page);
  await practicePage.goto();

  // Assertion: entrepreneur radio should be disabled
  await expect(practicePage.entrepreneurRadio).toBeDisabled();
});
