import { expect, Locator } from "@playwright/test";

/**
 * Register custom matchers that any project can use.
 * Call registerCustomMatchers() in your test setup.
 */
export function registerCustomMatchers(): void {
  expect.extend({
    async toHaveExactCount(locator: Locator, expected: number) {
      const actual = await locator.count();
      const pass = actual === expected;

      return {
        pass,
        message: () =>
          pass
            ? `Expected locator NOT to have ${expected} elements, but it does`
            : `Expected locator to have ${expected} elements, but found ${actual}`,
        name: "toHaveExactCount",
        expected,
        actual,
      };
    },

    async toContainTextIgnoreCase(locator: Locator, expected: string) {
      const actual = (await locator.textContent()) || "";
      const pass = actual.toLowerCase().includes(expected.toLowerCase());

      return {
        pass,
        message: () =>
          pass
            ? `Expected locator NOT to contain "${expected}" (case-insensitive)`
            : `Expected locator to contain "${expected}" (case-insensitive), but got "${actual}"`,
        name: "toContainTextIgnoreCase",
        expected,
        actual,
      };
    },
  });
}
