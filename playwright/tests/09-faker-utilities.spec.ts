import { test, expect } from "@playwright/test";
import { PracticePage } from "../pages/PracticePage.js";
import {
  generatePracticeFormData,
  generateRandomName,
  type PracticeFormData,
} from "../utils/test-data.js";

test.describe("Faker.js + Utilities Tests", () => {
  let practicePage: PracticePage;

  test.beforeEach(async ({ page }) => {
    practicePage = new PracticePage(page);
    await practicePage.goto();
  });

  test("fill form with random Faker data and verify success @smoke", async () => {
    // Generate completely random form data using our utility
    const formData: PracticeFormData = generatePracticeFormData();

    // Log the generated data so we can see what was used (useful for debugging)
    console.log("Generated form data:", formData);

    // Fill the form using POM + random data
    await practicePage.fillForm(formData);

    // Verify the form was filled with the generated data
    await expect(practicePage.nameInput).toHaveValue(formData.name);
    await expect(practicePage.emailInput).toHaveValue(formData.email);
    await expect(practicePage.passwordInput).toHaveValue(formData.password);
    await expect(practicePage.genderSelect).toHaveValue(formData.gender);

    // Submit and verify success
    await practicePage.submit();
    await expect(practicePage.successAlert).toBeVisible();
    await expect(practicePage.successAlert).toContainText("Success");
  });

  test("fill form with different random data on each run @regression", async () => {
    // Every time this test runs, it uses DIFFERENT data
    // This catches bugs that hardcoded data would miss
    const formData = generatePracticeFormData();

    console.log("Run with data:", formData);

    await practicePage.fillForm(formData);
    await practicePage.submit();

    await expect(practicePage.successAlert).toBeVisible();
  });

  test("use individual utility for name field only @regression", async () => {
    // Sometimes you only need one random value, not the whole form
    const randomName = generateRandomName();

    console.log("Random name:", randomName);

    await practicePage.nameInput.fill(randomName);
    await expect(practicePage.nameInput).toHaveValue(randomName);
  });
});
