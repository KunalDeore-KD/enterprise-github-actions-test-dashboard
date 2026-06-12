import type { Actor, Task } from "../actors/Actor.js";

/**
 * Interaction: Select a dropdown option.
 * Usage: Select.option("Male").from("#gender")
 */
export class Select implements Task {
  private selector = "";

  private constructor(private label: string) {}

  static option(label: string): Select {
    return new Select(label);
  }

  from(selector: string): Select {
    this.selector = selector;
    return this;
  }

  async performAs(actor: Actor): Promise<void> {
    const page = actor.getAbility().getPage();
    await page.locator(this.selector).selectOption({ label: this.label });
  }
}
