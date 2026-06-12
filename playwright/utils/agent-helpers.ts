import type { Page, Locator } from "@playwright/test";

/**
 * Auto-healing locator: tries multiple strategies to find an element.
 * If the first strategy fails, it falls back to the next one.
 * This makes tests more resilient to UI changes.
 */
export async function findElement(
  page: Page,
  strategies: string[],
  description: string,
): Promise<Locator> {
  for (const strategy of strategies) {
    const locator = page.locator(strategy);
    const count = await locator.count();

    if (count === 1) {
      console.log(`[Agent] Found "${description}" using: ${strategy}`);
      return locator;
    }
  }

  throw new Error(
    `[Agent] Could not find "${description}" with any strategy: ${strategies.join(", ")}`,
  );
}

/**
 * Detects the current state of the page.
 * Returns a string describing what the page is showing.
 */
export async function detectPageState(page: Page): Promise<string> {
  // Check for common states in order of priority
  if (
    await page
      .locator(".loading-spinner, .spinner")
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    return "loading";
  }

  if (
    await page
      .locator(".alert-danger, .error-message")
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    return "error";
  }

  if (
    await page
      .locator(".alert-success")
      .isVisible()
      .catch(() => false)
  ) {
    return "success";
  }

  if (
    await page
      .locator("form")
      .isVisible()
      .catch(() => false)
  ) {
    return "form-ready";
  }

  return "unknown";
}

/**
 * Retries an action up to maxRetries times.
 * Useful for handling intermittent failures.
 */
export async function retryAction(
  action: () => Promise<void>,
  description: string,
  maxRetries: number = 3,
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await action();
      console.log(`[Agent] "${description}" succeeded on attempt ${attempt}`);
      return;
    } catch (error) {
      console.log(`[Agent] "${description}" failed on attempt ${attempt}`);
      if (attempt === maxRetries) {
        throw error;
      }
    }
  }
}

/**
 * Logs a step with a description (makes test output readable like manual test steps).
 */
export function logStep(stepNumber: number, description: string): void {
  console.log(`[Agent] Step ${stepNumber}: ${description}`);
}
