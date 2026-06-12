import type { Actor, Task } from "../actors/Actor.js";

/**
 * Interaction: Click on an element.
 * Usage: Click.on("#submit")
 */
export class Click implements Task {
  private constructor(private selector: string) {}

  static on(selector: string): Click {
    return new Click(selector);
  }

  async performAs(actor: Actor): Promise<void> {
    const page = actor.getAbility().getPage();
    await page.locator(this.selector).click();
  }
}
