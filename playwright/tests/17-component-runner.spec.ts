import { test, expect } from "@playwright/test";
import { faker } from "@faker-js/faker";
import { ComponentRunner } from "../components/ComponentRunner.js";

test.describe("Component Runner: Inline Mount", () => {
  test("mount a button and verify click @component", async ({ page }) => {
    const runner = new ComponentRunner(page);

    await runner.mount(`
      <button id="counter-btn" class="btn btn-primary" onclick="
        this.dataset.count = (parseInt(this.dataset.count || 0) + 1);
        this.textContent = 'Clicked ' + this.dataset.count + ' times';
      ">Click me</button>
    `);

    const button = page.locator("#counter-btn");
    await expect(button).toHaveText("Click me");

    await button.click();
    await expect(button).toHaveText("Clicked 1 times");

    await button.click();
    await button.click();
    await expect(button).toHaveText("Clicked 3 times");
  });

  test("mount a form inline and test validation @component", async ({ page }) => {
    const runner = new ComponentRunner(page);

    await runner.mount(`
      <form id="mini-form" onsubmit="event.preventDefault();
        const name = document.getElementById('nameInput').value;
        if (!name) {
          document.getElementById('error').style.display = 'block';
        } else {
          document.getElementById('error').style.display = 'none';
          document.getElementById('result').textContent = 'Hello, ' + name + '!';
          document.getElementById('result').style.display = 'block';
        }
      ">
        <div class="form-group">
          <input type="text" id="nameInput" class="form-control" placeholder="Enter name">
          <span id="error" style="color:red; display:none;">Name is required</span>
        </div>
        <button type="submit" class="btn btn-success" id="submitBtn">Submit</button>
        <div id="result" class="mt-2 text-success" style="display:none;"></div>
      </form>
    `);

    // Test 1: Submit empty form — should show error
    await page.locator("#submitBtn").click();
    await expect(page.locator("#error")).toBeVisible();
    await expect(page.locator("#result")).not.toBeVisible();

    // Test 2: Fill name and submit — should show greeting
    const name = faker.person.firstName();
    await page.locator("#nameInput").fill(name);
    await page.locator("#submitBtn").click();

    await expect(page.locator("#error")).not.toBeVisible();
    await expect(page.locator("#result")).toBeVisible();
    await expect(page.locator("#result")).toHaveText(`Hello, ${name}!`);
  });
});

test.describe("Component Runner: File Mount", () => {
  test("mount dropdown fixture and test selection @component", async ({ page }) => {
    const runner = new ComponentRunner(page);
    await runner.mountFile("components/fixtures/dropdown.html");

    const dropdown = page.locator("#genderSelect");
    const display = page.locator("#display");

    // Default state
    await expect(display).toHaveText("None");

    // Select Male
    await dropdown.selectOption("Male");
    await expect(display).toHaveText("Male");

    // Select Female
    await dropdown.selectOption("Female");
    await expect(display).toHaveText("Female");

    // Select Other
    await dropdown.selectOption("Other");
    await expect(display).toHaveText("Other");

    // Reset to empty
    await dropdown.selectOption("");
    await expect(display).toHaveText("None");
  });

  test("mount login form fixture and test validation @component", async ({ page }) => {
    const runner = new ComponentRunner(page);
    await runner.mountFile("components/fixtures/login-form.html");

    const emailInput = page.locator("#email");
    const passwordInput = page.locator("#password");
    const submitBtn = page.locator("#submitBtn");
    const emailError = page.locator("#emailError");
    const passwordError = page.locator("#passwordError");
    const successMsg = page.locator("#successMsg");

    // Test 1: Submit empty form — both errors visible
    await submitBtn.click();
    await expect(emailError).toBeVisible();
    await expect(passwordError).toBeVisible();
    await expect(successMsg).not.toBeVisible();

    // Test 2: Fill only email — password error still visible
    await emailInput.fill(faker.internet.email());
    await submitBtn.click();
    await expect(emailError).not.toBeVisible();
    await expect(passwordError).toBeVisible();
    await expect(successMsg).not.toBeVisible();

    // Test 3: Fill both — success message visible
    await passwordInput.fill(faker.internet.password());
    await submitBtn.click();
    await expect(emailError).not.toBeVisible();
    await expect(passwordError).not.toBeVisible();
    await expect(successMsg).toBeVisible();
    await expect(successMsg).toHaveText("Login successful!");
  });

  test("login form with random Faker data @component", async ({ page }) => {
    const runner = new ComponentRunner(page);
    await runner.mountFile("components/fixtures/login-form.html");

    const email = faker.internet.email();
    const password = faker.internet.password({ length: 12 });

    console.log(`[Component Test] Email: ${email}`);
    console.log(`[Component Test] Password: ${password}`);

    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.locator("#submitBtn").click();

    await expect(page.locator("#successMsg")).toBeVisible();
    await expect(page.locator("#successMsg")).toHaveText("Login successful!");
  });
});
