import type { Page, Locator } from "@playwright/test";
import { PRACTICE_PAGE_URL } from "../utils/urls.js";

export class PracticePage {
  // Store the page reference
  readonly page: Page;

  // Define all locators as readonly properties
  readonly nameInput: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly iceCreamCheckbox: Locator;
  readonly genderSelect: Locator;
  readonly studentRadio: Locator;
  readonly employedRadio: Locator;
  readonly entrepreneurRadio: Locator;
  readonly dobInput: Locator;
  readonly submitButton: Locator;
  readonly successAlert: Locator;

  // Constructor: receives the Playwright page and initializes all locators
  constructor(page: Page) {
    this.page = page;

    // We use the same locator strategies we learned in Phase 3.3
    const form = page.locator("form");

    this.nameInput = form.locator('input[name="name"]').first();
    this.emailInput = form.locator('input[name="email"]');
    this.passwordInput = page.locator("#exampleInputPassword1");
    this.iceCreamCheckbox = page.getByLabel("Check me out if you Love IceCreams!");
    this.genderSelect = page.locator("#exampleFormControlSelect1");
    this.studentRadio = page.locator("#inlineRadio1");
    this.employedRadio = page.locator("#inlineRadio2");
    this.entrepreneurRadio = page.locator("#inlineRadio3");
    this.dobInput = form.locator('input[name="bday"]');
    this.submitButton = form.locator('input[type="submit"][value="Submit"]');
    this.successAlert = page.locator(".alert-success");
  }

  // Method: navigate to the practice page
  async goto() {
    await this.page.goto(PRACTICE_PAGE_URL);
  }

  // Method: fill the entire form with provided data
  async fillForm(data: {
    name: string;
    email: string;
    password: string;
    gender: string;
    dob: string;
    loveIceCream: boolean;
    employment: "student" | "employed";
  }) {
    await this.nameInput.fill(data.name);
    await this.emailInput.fill(data.email);
    await this.passwordInput.fill(data.password);

    if (data.loveIceCream) {
      await this.iceCreamCheckbox.scrollIntoViewIfNeeded();
      await this.iceCreamCheckbox.check();
    }

    await this.genderSelect.scrollIntoViewIfNeeded();
    await this.genderSelect.selectOption({ label: data.gender });

    if (data.employment === "student") {
      await this.page.locator("label[for='inlineRadio1']").scrollIntoViewIfNeeded();
      await this.page.locator("label[for='inlineRadio1']").click();
    } else {
      await this.page.locator("label[for='inlineRadio2']").scrollIntoViewIfNeeded();
      await this.page.locator("label[for='inlineRadio2']").click();
    }

    await this.dobInput.fill(data.dob);
  }

  // Method: click the submit button
  async submit() {
    await this.submitButton.click();
  }
}
