import type { Actor, Question } from "../actors/Actor.js";

/**
 * Question: Is an element visible?
 * Usage: await actor.asks(Visibility.of(".alert-success"))
 */
export class Visibility implements Question<boolean> {
  private constructor(private selector: string) {}

  static of(selector: string): Visibility {
    return new Visibility(selector);
  }

  async answeredBy(actor: Actor): Promise<boolean> {
    const page = actor.getAbility().getPage();
    return page.locator(this.selector).isVisible();
  }
}
