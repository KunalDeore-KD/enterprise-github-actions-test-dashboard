# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 20-flaky-demo.spec.ts >> Flaky demo >> intermittent assertion recovers on retry @regression
- Location: tests/20-flaky-demo.spec.ts:18:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 3
Received: 2
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | import { PRACTICE_PAGE_URL } from "../utils/urls.js";
  3  | 
  4  | test.describe("Flaky demo", () => {
  5  |   // Global config uses retries only in CI; this file needs retries locally too.
  6  |   test.describe.configure({ retries: 1 });
  7  | 
  8  |   test("fails on first attempt then passes on retry @regression", async ({ page }) => {
  9  |     await page.goto(PRACTICE_PAGE_URL);
  10 | 
  11 |     if (test.info().retry === 0) {
  12 |       await expect(page.locator("#this-element-does-not-exist-for-flaky-demo")).toBeVisible({ timeout: 500 });
  13 |     }
  14 | 
  15 |     await expect(page.locator("form")).toBeVisible();
  16 |   });
  17 | 
  18 |   test("intermittent assertion recovers on retry @regression", async () => {
  19 |     if (test.info().retry === 0) {
> 20 |       expect(1 + 1).toBe(3);
     |                     ^ Error: expect(received).toBe(expected) // Object.is equality
  21 |     }
  22 | 
  23 |     expect(2 + 2).toBe(4);
  24 |   });
  25 | });
  26 | 
```