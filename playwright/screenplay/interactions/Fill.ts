import type { Actor, Task } from "../actors/Actor.js";

/**
 * Interaction: Fill an input field.
 * Usage: Fill.in("#name").with("Kunal")
 */
export class Fill implements Task {
  private value = "";

  private constructor(private selector: string) {}

  static in(selector: string): Fill {
    return new Fill(selector);
  }

  with(value: string): Fill {
    this.value = value;
    return this;
  }

  async performAs(actor: Actor): Promise<void> {
    const page = actor.getAbility().getPage();
    await page.locator(this.selector).fill(this.value);
  }
}
