import type { Actor, Question } from "../actors/Actor.js";

/**
 * Question: What is the text of an element?
 * Usage: const text = await actor.sees(TextOf.element(".alert-success"))
 */
export class TextOf implements Question<string> {
  private constructor(private selector: string) {}

  static element(selector: string): TextOf {
    return new TextOf(selector);
  }

  async answeredBy(actor: Actor): Promise<string> {
    const page = actor.getAbility().getPage();
    return page.locator(this.selector).innerText();
  }
}
