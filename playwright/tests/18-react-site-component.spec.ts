import { test, expect } from "@playwright/test";
import { faker } from "@faker-js/faker";
import { TODO_URL } from "../utils/urls.js";

/**
 * Component-style tests on a local TodoMVC fixture.
 *
 * We treat individual widgets on the page as isolated components:
 * - Input box (new todo)
 * - Todo item (checkbox + label + delete)
 * - Filter bar (All / Active / Completed)
 * - Counter ("X items left")
 *
 * This demonstrates testing React components on a live site
 * without needing the source code.
 */

function decodeHtmlEntities(text?: string | null) {
  return text
    ? text
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
        .replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    : "";
}

test.describe("React Site Component: Todo Input", () => {
  test("input should be focused on page load @component", async ({ page }) => {
    await page.goto(TODO_URL);

    const input = page.getByPlaceholder("What needs to be done?");
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
  });

  test("input should add a todo on Enter @component", async ({ page }) => {
    await page.goto(TODO_URL);

    const todoText = faker.hacker.phrase();
    const input = page.getByPlaceholder("What needs to be done?");

    await input.fill(todoText);
    await input.press("Enter");

    // Verify the todo appears in the list
    await expect(page.getByTestId("todo-item")).toHaveCount(1);
    const firstLabel = page.getByTestId("todo-item-label").first();
    await expect(decodeHtmlEntities(await firstLabel.textContent())).toBe(todoText);

    // Input should be cleared after adding
    await expect(input).toHaveValue("");
  });

  test("input should not add empty todo @component", async ({ page }) => {
    await page.goto(TODO_URL);

    const input = page.getByPlaceholder("What needs to be done?");
    await input.press("Enter");

    // No todo should be added
    await expect(page.getByTestId("todo-item")).toHaveCount(0);
  });

  test("add multiple todos with Faker data @component", async ({ page }) => {
    await page.goto(TODO_URL);

    const input = page.getByPlaceholder("What needs to be done?");
    const todos = Array.from({ length: 5 }, () => faker.hacker.phrase());

    for (const todo of todos) {
      await input.fill(todo);
      await input.press("Enter");
    }

    await expect(page.getByTestId("todo-item")).toHaveCount(5);

    // Verify each todo text is present
    for (let i = 0; i < todos.length; i++) {
      const todo = todos[i]!;
      const todoLabel = page.getByTestId("todo-item-label").nth(i);
      await expect(decodeHtmlEntities(await todoLabel.textContent())).toBe(todo);
    }
  });
});

test.describe("React Site Component: Todo Item", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TODO_URL);

    // Add 3 todos
    const input = page.getByPlaceholder("What needs to be done?");
    await input.fill("Learn Playwright");
    await input.press("Enter");
    await input.fill("Write component tests");
    await input.press("Enter");
    await input.fill("Review pull request");
    await input.press("Enter");
  });

  test("should display 3 todo items @component", async ({ page }) => {
    await expect(page.getByTestId("todo-item")).toHaveCount(3);
  });

  test("checkbox should toggle todo completion @component", async ({ page }) => {
    const firstTodo = page.getByTestId("todo-item").first();
    const checkbox = firstTodo.getByRole("checkbox");

    // Initially unchecked
    await expect(checkbox).not.toBeChecked();

    // Check it
    await checkbox.check();
    await expect(checkbox).toBeChecked();

    // Uncheck it
    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();
  });

  test("completed todo should have completed class @component", async ({ page }) => {
    const firstTodo = page.getByTestId("todo-item").first();
    const checkbox = firstTodo.getByRole("checkbox");

    await checkbox.check();

    // The todo item should have a 'completed' class (strikethrough style)
    await expect(firstTodo).toHaveClass(/completed/);
  });

  test("delete button should remove todo on hover @component", async ({ page }) => {
    await expect(page.getByTestId("todo-item")).toHaveCount(3);

    const firstTodo = page.getByTestId("todo-item").first();

    // Hover to reveal delete button, then click it
    await firstTodo.hover();
    await firstTodo.getByRole("button", { name: "×" }).click();

    await expect(page.getByTestId("todo-item")).toHaveCount(2);
  });

  test("double-click to edit a todo @component", async ({ page }) => {
    const firstTodo = page.getByTestId("todo-item").first();
    const label = firstTodo.locator("label");

    // Double-click to enter edit mode
    await label.dblclick();

    // Edit input should appear
    const editInput = firstTodo.locator('input[data-testid="text-input"]');
    await expect(editInput).toBeVisible();

    // Clear and type new text
    await editInput.fill("Updated task name");
    await editInput.press("Enter");

    // Verify the text is updated
    const updatedLabel = firstTodo.locator('label[data-testid="todo-item-label"]');
    await expect(decodeHtmlEntities(await updatedLabel.textContent())).toBe("Updated task name");
  });
});

test.describe("React Site Component: Filter Bar", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TODO_URL);

    const input = page.getByPlaceholder("What needs to be done?");
    await input.fill("Active task 1");
    await input.press("Enter");
    await input.fill("Active task 2");
    await input.press("Enter");
    await input.fill("Completed task");
    await input.press("Enter");

    // Complete the third todo
    await page.getByTestId("todo-item").nth(2).getByRole("checkbox").check();
  });

  test("All filter shows all todos @component", async ({ page }) => {
    await page.getByRole("link", { name: "All" }).click();
    await expect(page.getByTestId("todo-item")).toHaveCount(3);
  });

  test("Active filter shows only active todos @component", async ({ page }) => {
    await page.getByRole("link", { name: "Active" }).click();
    await expect(page.getByTestId("todo-item")).toHaveCount(2);
  });

  test("Completed filter shows only completed todos @component", async ({ page }) => {
    await page.getByRole("link", { name: "Completed" }).click();
    await expect(page.getByTestId("todo-item")).toHaveCount(1);
    await expect(page.getByTestId("todo-item").first()).toContainText("Completed task");
  });

  test("Clear completed button removes completed todos @component", async ({ page }) => {
    // Should have 3 total
    await expect(page.getByTestId("todo-item")).toHaveCount(3);

    // Click "Clear completed"
    await page.getByRole("button", { name: "Clear completed" }).click();

    // Only 2 active todos should remain
    await expect(page.getByTestId("todo-item")).toHaveCount(2);
  });
});

test.describe("React Site Component: Items Counter", () => {
  test("counter updates as todos are added @component", async ({ page }) => {
    await page.goto(TODO_URL);

    const input = page.getByPlaceholder("What needs to be done?");
    const counter = page.locator("span.todo-count");

    await input.fill("First todo");
    await input.press("Enter");
    await expect(counter).toContainText("1 item left");

    await input.fill("Second todo");
    await input.press("Enter");
    await expect(counter).toContainText("2 items left");

    await input.fill("Third todo");
    await input.press("Enter");
    await expect(counter).toContainText("3 items left");
  });

  test("counter decreases when todo is completed @component", async ({ page }) => {
    await page.goto(TODO_URL);

    const input = page.getByPlaceholder("What needs to be done?");
    await input.fill("Task A");
    await input.press("Enter");
    await input.fill("Task B");
    await input.press("Enter");
    await input.fill("Task C");
    await input.press("Enter");

    const counter = page.locator("span.todo-count");
    await expect(counter).toContainText("3 items left");

    // Complete one
    await page.getByTestId("todo-item").first().getByRole("checkbox").check();
    await expect(counter).toContainText("2 items left");

    // Complete another
    await page.getByTestId("todo-item").nth(1).getByRole("checkbox").check();
    await expect(counter).toContainText("1 item left");
  });

  test("counter increases when completed todo is unchecked @component", async ({ page }) => {
    await page.goto(TODO_URL);

    const input = page.getByPlaceholder("What needs to be done?");
    await input.fill("My task");
    await input.press("Enter");

    const counter = page.locator("span.todo-count");
    const checkbox = page.getByTestId("todo-item").first().getByRole("checkbox");

    await expect(counter).toContainText("1 item left");

    // Complete it
    await checkbox.check();
    await expect(counter).toContainText("0 items left");

    // Uncomplete it
    await checkbox.uncheck();
    await expect(counter).toContainText("1 item left");
  });
});

test.describe("React Site Component: Toggle All", () => {
  test("toggle all should complete all todos @component", async ({ page }) => {
    await page.goto(TODO_URL);

    const input = page.getByPlaceholder("What needs to be done?");
    await input.fill("Task 1");
    await input.press("Enter");
    await input.fill("Task 2");
    await input.press("Enter");
    await input.fill("Task 3");
    await input.press("Enter");

    // Click "Toggle All" (the down arrow checkbox)
    await page.locator(".toggle-all").check({ force: true });

    // All todos should be completed
    const todos = page.getByTestId("todo-item");
    for (let i = 0; i < 3; i++) {
      await expect(todos.nth(i)).toHaveClass(/completed/);
    }

    await expect(page.locator("span.todo-count")).toContainText("0 items left");
  });
});
