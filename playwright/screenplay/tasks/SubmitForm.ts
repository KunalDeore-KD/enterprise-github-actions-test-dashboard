import type { Actor, Task } from "../actors/Actor.js";
import { Click } from "../interactions/Click.js";

/**
 * Task: Submit the form.
 * Usage: SubmitForm.now()
 */
export class SubmitForm implements Task {
  static now(): SubmitForm {
    return new SubmitForm();
  }

  async performAs(actor: Actor): Promise<void> {
    await Click.on('input[type="submit"]').performAs(actor);
  }
}
