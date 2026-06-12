import { test, expect } from "@playwright/test";
import { faker } from "@faker-js/faker";
import { findElement, detectPageState, retryAction, logStep } from "../utils/agent-helpers.js";
import { PRACTICE_PAGE_URL } from "../utils/urls.js";

test.describe("Playwright Test Agent Patterns", () => {
  test("agent-like form fill with auto-healing locators @agent", async ({ page }) => {
    logStep(1, "Navigate to practice page");
    await page.goto(PRACTICE_PAGE_URL);

    logStep(2, "Detect page state");
    const state = await detectPageState(page);
    console.log(`[Agent] Page state: ${state}`);
    expect(state).toBe("form-ready");

    const testName = faker.person.fullName();
    const testEmail = faker.internet.email({
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
    });
    const testPassword = faker.internet.password({
      length: 12,
      memorable: true,
      pattern: /[A-Za-z0-9!@#$%^&*]/,
    });

    logStep(3, "Find name input using auto-healing locator");
    const nameInput = await findElement(
      page,
      [
        '[data-testid="name-input"]', // strategy 1: test id (doesn't exist here)
        "#nameInput", // strategy 2: id (doesn't exist here)
        'form input[name="name"]:first-of-type', // strategy 3: scoped CSS (works!)
      ],
      "Name input",
    );
    await nameInput.fill(testName);
    await expect(nameInput).toHaveValue(testName);

    logStep(4, "Find email input using auto-healing locator");
    const emailInput = await findElement(
      page,
      [
        '[data-testid="email-input"]', // doesn't exist
        "#emailInput", // doesn't exist
        'input[name="email"]', // works!
      ],
      "Email input",
    );
    await emailInput.fill(testEmail);
    await expect(emailInput).toHaveValue(testEmail);

    logStep(5, "Find password input using auto-healing locator");
    const passwordInput = await findElement(
      page,
      [
        '[data-testid="password"]', // doesn't exist
        "#exampleInputPassword1", // works!
        'input[type="password"]', // fallback
      ],
      "Password input",
    );
    await passwordInput.fill(testPassword);
    await expect(passwordInput).toHaveValue(testPassword);

    logStep(6, "Find and select gender dropdown");
    const genderSelect = await findElement(
      page,
      [
        '[data-testid="gender-select"]', // doesn't exist
        "#exampleFormControlSelect1", // works!
        "select", // fallback
      ],
      "Gender dropdown",
    );
    await genderSelect.selectOption({ label: "Male" });
    await expect(genderSelect).toHaveValue("Male");

    logStep(7, "Submit form with retry logic");
    await retryAction(async () => {
      const submitBtn = await findElement(
        page,
        [
          '[data-testid="submit-btn"]',
          'input[type="submit"][value="Submit"]',
          'input[type="submit"]',
        ],
        "Submit button",
      );
      await submitBtn.click();

      // Verify success within the retry
      const successAlert = page.locator(".alert-success");
      await expect(successAlert).toBeVisible({ timeout: 5000 });
    }, "Form submission");

    logStep(8, "Verify success state");
    const finalState = await detectPageState(page);
    console.log(`[Agent] Final page state: ${finalState}`);
    expect(finalState).toBe("success");

    const successAlert = page.locator(".alert-success");
    await expect(successAlert).toContainText("Success");

    console.log("[Agent] Test completed successfully!");
  });

  test("agent detects disabled elements @agent", async ({ page }) => {
    logStep(1, "Navigate to practice page");
    await page.goto(PRACTICE_PAGE_URL);

    logStep(2, "Detect page state");
    const state = await detectPageState(page);
    expect(state).toBe("form-ready");

    logStep(3, "Find entrepreneur radio and check if disabled");
    const entrepreneurRadio = await findElement(
      page,
      ['[data-testid="entrepreneur-radio"]', "#inlineRadio3", 'input[value="Entrepreneur"]'],
      "Entrepreneur radio",
    );

    const isDisabled = await entrepreneurRadio.isDisabled();
    console.log(`[Agent] Entrepreneur radio disabled: ${isDisabled}`);
    expect(isDisabled).toBe(true);

    logStep(4, "Verify student radio is enabled and selectable");
    const studentRadio = await findElement(
      page,
      ['[data-testid="student-radio"]', "#inlineRadio1", 'input[value="Student"]'],
      "Student radio",
    );

    const isEnabled = await studentRadio.isEnabled();
    console.log(`[Agent] Student radio enabled: ${isEnabled}`);
    expect(isEnabled).toBe(true);

    await studentRadio.check();
    await expect(studentRadio).toBeChecked();

    console.log("[Agent] Disabled element detection test completed!");
  });
});
