import type { Actor, Task } from "../actors/Actor.js";

/**
 * Task: Navigate to a URL.
 * Usage: Navigate.to("<https://example.com")>
 */
export class Navigate implements Task {
  private constructor(private url: string) {}

  static to(url: string): Navigate {
    return new Navigate(url);
  }

  async performAs(actor: Actor): Promise<void> {
    const page = actor.getAbility().getPage();
    await page.goto(this.url);
  }
}
