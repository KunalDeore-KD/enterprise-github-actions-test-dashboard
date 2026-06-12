import { test, expect } from "@playwright/test";
import {
  BasePage,
  ComponentRunner,
  Logger,
  generateAddress,
  generateFormData,
  generateUserData,
  retry,
} from "playwright-shared-lib";
import { PRACTICE_PAGE_URL } from "../utils/urls.js";

const log = new Logger("SharedLib");

test.describe("Shared Library Demo", () => {
  test("use BasePage for common actions @shared", async ({ page }) => {
    const basePage = new BasePage(page);

    await basePage.goto(PRACTICE_PAGE_URL);

    const title = await basePage.getTitle();
    log.info(`Page title: ${title}`);
    expect(title).toContain("AngularPractice");

    const url = basePage.getUrl();
    log.info(`Current URL: ${url}`);
    expect(url).toContain("angularpractice");

    // Use fillAndVerify from BasePage
    const nameInput = page.locator('form input[name="name"]:first-of-type');
    await basePage.fillAndVerify(nameInput, "Kunal Deore");

    log.success("BasePage actions completed");
  });

  test("use data generators for random test data @shared", async ({ page }) => {
    const user = generateUserData();
    const form = generateFormData();
    const address = generateAddress();

    log.info("Generated user:", user);
    log.info("Generated form:", form);
    log.info("Generated address:", address);

    // Verify all fields are populated
    expect(user.firstName).toBeTruthy();
    expect(user.email).toContain("@");
    expect(user.password.length).toBeGreaterThanOrEqual(12);

    expect(form.gender).toMatch(/^(Male|Female)$/);
    expect(form.dateOfBirth).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    expect(address.city).toBeTruthy();
    expect(address.country).toBeTruthy();

    // Use the generated data on a local fixture page
    await page.goto(PRACTICE_PAGE_URL);
    await page.locator('form input[name="name"]:first-of-type').fill(form.name);
    await page.locator('input[name="email"]').fill(form.email);
    await page.locator("#exampleInputPassword1").fill(form.password);
    await page.locator("#exampleFormControlSelect1").selectOption({ label: form.gender });
    await page.locator('input[type="submit"]').click();

    await expect(page.locator(".alert-success")).toBeVisible();
    log.success("Form submitted with generated data");
  });

  test("use ComponentRunner from shared library @shared", async ({ page }) => {
    const runner = new ComponentRunner(page);

    await runner.mount(`
      <div>
        <h3 id="title">Shared Component</h3>
        <input type="text" id="input" class="form-control" placeholder="Type here">
        <p id="output" class="mt-2"></p>
      </div>
    `);

    const root = runner.getRoot();
    await expect(root).toBeVisible();
    await expect(page.locator("#title")).toHaveText("Shared Component");

    await page.locator("#input").fill("Hello from shared library!");
    log.success("ComponentRunner from shared library works");
  });

  test("use retry helper for flaky operations @shared", async ({ page }) => {
    let attempt = 0;

    // Simulate a flaky operation that succeeds on 3rd try
    const result = await retry(
      async () => {
        attempt++;
        if (attempt < 3) throw new Error("Not ready yet");
        return "success";
      },
      { maxRetries: 5, delayMs: 100, description: "flaky operation" },
    );

    expect(result).toBe("success");
    expect(attempt).toBe(3);
    log.success(`Retry succeeded after ${attempt} attempts`);
  });

  test("use Logger for structured output @shared", async ({ page }) => {
    const testLog = new Logger("MyTest");

    testLog.step(1, "Navigate to page");
    await page.goto(PRACTICE_PAGE_URL);

    testLog.step(2, "Verify page loaded");
    await expect(page.locator("h1")).toBeVisible();

    testLog.step(3, "Fill form");
    const form = generateFormData();
    await page.locator('form input[name="name"]:first-of-type').fill(form.name);

    testLog.step(4, "Submit");
    await page.locator('input[type="submit"]').click();

    testLog.step(5, "Verify success");
    await expect(page.locator(".alert-success")).toBeVisible();

    testLog.success("All steps completed!");
  });
});
