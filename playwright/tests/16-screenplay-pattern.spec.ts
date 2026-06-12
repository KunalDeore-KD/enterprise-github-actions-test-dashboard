import { test, expect } from "@playwright/test";
import { faker } from "@faker-js/faker";
import { Actor } from "../screenplay/actors/Actor.js";
import { BrowseTheWeb } from "../screenplay/abilities/BrowseTheWeb.js";
import { Navigate } from "../screenplay/tasks/Navigate.js";
import { FillForm } from "../screenplay/tasks/FillForm.js";
import { SubmitForm } from "../screenplay/tasks/SubmitForm.js";
import { Visibility } from "../screenplay/questions/Visibility.js";
import { TextOf } from "../screenplay/questions/TextOf.js";
import { PRACTICE_PAGE_URL } from "../utils/urls.js";

test.describe("Screenplay Pattern Demo", () => {
  test("actor fills form and verifies success @screenplay", async ({ page }) => {
    // 1. Create an Actor with the ability to browse the web
    const kunal = Actor.named("Kunal").whoCan(BrowseTheWeb.using(page));

    // 2. Generate random form data using Faker
    const formData = {
      name: faker.person.fullName(),
      email: faker.internet.email(),
      password: faker.internet.password({ length: 12 }),
      gender: faker.helpers.arrayElement(["Male", "Female"]),
    };

    console.log(`[Test] Actor: ${kunal.getName()}`);
    console.log(`[Test] Form data:`, formData);

    // 3. Actor performs tasks (reads like a story!)
    await kunal.attemptsTo(
      Navigate.to(PRACTICE_PAGE_URL),
      FillForm.with(formData),
      SubmitForm.now(),
    );

    // 4. Actor asks questions (verifies results)
    await kunal.asks(Visibility.of(".alert-success"));

    // 5. Actor sees the success message text
    const successText = await kunal.sees(TextOf.element(".alert-success"));
    console.log(`[Test] Success message: ${successText}`);
    expect(successText).toContain("Success");
  });

  test("two actors with different roles @screenplay", async ({ page }) => {
    // Demonstrate multiple actors (same page, different personas)
    const student = Actor.named("Student Kunal").whoCan(BrowseTheWeb.using(page));

    const studentData = {
      name: faker.person.fullName(),
      email: faker.internet.email(),
      password: faker.internet.password({ length: 12 }),
      gender: "Male",
    };

    console.log(`[Test] Actor: ${student.getName()}`);

    // Student fills and submits the form
    await student.attemptsTo(
      Navigate.to(PRACTICE_PAGE_URL),
      FillForm.with(studentData),
      SubmitForm.now(),
    );

    // Student verifies success
    await student.asks(Visibility.of(".alert-success"));

    const message = await student.sees(TextOf.element(".alert-success"));
    console.log(`[Test] ${student.getName()} sees: ${message}`);
    expect(message).toContain("Success");
  });

  test("screenplay vs POM comparison @screenplay", async ({ page }) => {
    /**
     * This test shows the SAME flow written in Screenplay style.
     * Compare with tests/07-pom-practice.spec.ts (POM style).
     *
     * POM style:
     *   const practicePage = new PracticePage(page);
     *   await practicePage.goto();
     *   await practicePage.fillForm(data);
     *   await practicePage.submit();
     *   await expect(practicePage.successAlert).toBeVisible();
     *
     * Screenplay style:
     *   await actor.attemptsTo(Navigate.to(url), FillForm.with(data), SubmitForm.now());
     *   await actor.asks(Visibility.of(".alert-success"));
     *
     * Both work. Screenplay reads more like a user story.
     * POM is simpler for small projects.
     * Screenplay scales better for complex, multi-actor scenarios.
     */

    const actor = Actor.named("Tester").whoCan(BrowseTheWeb.using(page));

    await actor.attemptsTo(
      Navigate.to(PRACTICE_PAGE_URL),
      FillForm.with({
        name: "Screenplay Test",
        email: "screenplay@test.com",
        password: "Test123!",
        gender: "Female",
      }),
      SubmitForm.now(),
    );

    await actor.asks(Visibility.of(".alert-success"));
    console.log("[Test] Screenplay pattern test completed!");
  });
});
