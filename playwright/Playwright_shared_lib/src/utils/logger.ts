/**
 * Simple logger with levels and timestamps.
 * Use instead of raw console.log for consistent output.
 */
export class Logger {
  constructor(private prefix: string = "Test") {}

  info(message: string, ...args: unknown[]): void {
    console.log(`[${this.prefix}] ℹ️  ${message}`, ...args);
  }

  success(message: string, ...args: unknown[]): void {
    console.log(`[${this.prefix}] ✅ ${message}`, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(`[${this.prefix}] ⚠️  ${message}`, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    console.error(`[${this.prefix}] ❌ ${message}`, ...args);
  }

  step(stepNumber: number, message: string): void {
    console.log(`[${this.prefix}] Step ${stepNumber}: ${message}`);
  }
}
