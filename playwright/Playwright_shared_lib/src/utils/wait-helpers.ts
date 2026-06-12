/**
 * Retry a function until it succeeds or times out.
 * Useful for flaky operations (API calls, element waits).
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; delayMs?: number; description?: string } = {},
): Promise<T> {
  const { maxRetries = 3, delayMs = 1000, description = "operation" } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      console.log(`[Retry] ${description} — attempt ${attempt}/${maxRetries} failed`);
      if (attempt === maxRetries) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(`[Retry] ${description} — all ${maxRetries} attempts failed`);
}

/**
 * Wait for a condition to become true.
 */
export async function waitForCondition(
  condition: () => Promise<boolean>,
  options: { timeoutMs?: number; pollIntervalMs?: number; description?: string } = {},
): Promise<void> {
  const { timeoutMs = 10000, pollIntervalMs = 500, description = "condition" } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`[Wait] ${description} — timed out after ${timeoutMs}ms`);
}
