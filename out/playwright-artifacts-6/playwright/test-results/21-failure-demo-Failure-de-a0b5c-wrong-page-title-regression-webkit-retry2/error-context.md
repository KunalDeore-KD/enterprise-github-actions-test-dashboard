# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 21-failure-demo.spec.ts >> Failure demo >> asserts the wrong page title @regression
- Location: tests/21-failure-demo.spec.ts:10:3

# Error details

```
Error: expect(page).toHaveTitle(expected) failed

Expected: "This Title Is Wrong On Purpose"
Received: "AngularPractice Local Fixture"
Timeout:  5000ms

Call log:
  - Expect "toHaveTitle" with timeout 5000ms
    14 × unexpected value "AngularPractice Local Fixture"

```

```yaml
- heading "AngularPractice Local Fixture" [level=1]
- paragraph:
  - link "Shop":
    - /url: shop.html
- text: Name
- textbox "Name"
- text: Email
- textbox "Email"
- text: Password
- textbox "Password"
- checkbox "Check me out if you Love IceCreams!"
- text: Check me out if you Love IceCreams! Gender
- combobox "Gender":
  - option "Male" [selected]
  - option "Female"
- radio "Student" [checked]
- text: Student
- radio "Employed"
- text: Employed
- radio "Entrepreneur" [disabled]
- text: Entrepreneur Date of Birth
- textbox "Date of Birth"
- button "Submit"
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | import { PRACTICE_PAGE_URL } from "../utils/urls.js";
  3  | 
  4  | test.describe("Failure demo", () => {
  5  |   test("expects a missing element @regression", async ({ page }) => {
  6  |     await page.goto(PRACTICE_PAGE_URL);
  7  |     await expect(page.locator("#intentional-failure-missing-element")).toBeVisible();
  8  |   });
  9  | 
  10 |   test("asserts the wrong page title @regression", async ({ page }) => {
  11 |     await page.goto(PRACTICE_PAGE_URL);
> 12 |     await expect(page).toHaveTitle("This Title Is Wrong On Purpose");
     |                        ^ Error: expect(page).toHaveTitle(expected) failed
  13 |   });
  14 | });
  15 | 
```