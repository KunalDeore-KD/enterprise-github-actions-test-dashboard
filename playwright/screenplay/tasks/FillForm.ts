import type { Actor, Task } from "../actors/Actor.js";
import { Fill } from "../interactions/Fill.js";
import { Select } from "../interactions/Select.js";

interface FormData {
  name: string;
  email: string;
  password: string;
  gender: string;
}

/**
 * Task: Fill the practice form with data.
 * Usage: FillForm.with({ name: "Kunal", email: "k@e.com", password: "pass", gender: "Male" })
 *
 * This is a COMPOSITE TASK — it uses multiple Interactions internally.
 * This is the power of Screenplay: tasks compose smaller interactions.
 */
export class FillForm implements Task {
  private constructor(private data: FormData) {}

  static with(data: FormData): FillForm {
    return new FillForm(data);
  }

  async performAs(actor: Actor): Promise<void> {
    await Fill.in('form input[name="name"]:first-of-type').with(this.data.name).performAs(actor);
    await Fill.in('input[name="email"]').with(this.data.email).performAs(actor);
    await Fill.in("#exampleInputPassword1").with(this.data.password).performAs(actor);
    await Select.option(this.data.gender).from("#exampleFormControlSelect1").performAs(actor);
  }
}
