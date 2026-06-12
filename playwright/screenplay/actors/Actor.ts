import { expect } from "@playwright/test";
import { BrowseTheWeb } from "../abilities/BrowseTheWeb.js";

/**
 * Represents a user (actor) who can perform tasks and ask questions.
 */
export class Actor {
  private ability: BrowseTheWeb | null = null;

  private constructor(private name: string) {}

  /**
   * Create a named actor.
   * Usage: Actor.named("Kunal")
   */
  static named(name: string): Actor {
    return new Actor(name);
  }

  /**
   * Give the actor an ability (e.g., BrowseTheWeb).
   * Usage: actor.whoCan(BrowseTheWeb.using(page))
   */
  whoCan(ability: BrowseTheWeb): Actor {
    this.ability = ability;
    return this;
  }

  /**
   * Get the actor's browser ability.
   */
  getAbility(): BrowseTheWeb {
    if (!this.ability) {
      throw new Error(`${this.name} does not have the ability to browse the web.`);
    }
    return this.ability;
  }

  /**
   * Get the actor's name.
   */
  getName(): string {
    return this.name;
  }

  /**
   * Perform one or more tasks.
   * Usage: await actor.attemptsTo(Navigate.to(url), FillForm.with(data))
   */
  async attemptsTo(...tasks: Task[]): Promise<void> {
    for (const task of tasks) {
      console.log(`[${this.name}] performs: ${task.constructor.name}`);
      await task.performAs(this);
    }
  }

  /**
   * Ask a question (verify something).
   * Usage: await actor.asks(SuccessMessage.isVisible())
   */
  async asks(question: Question<boolean>): Promise<void> {
    console.log(`[${this.name}] asks: ${question.constructor.name}`);
    const answer = await question.answeredBy(this);
    expect(answer).toBe(true);
  }

  /**
   * Get the answer to a question (returns the value).
   * Usage: const text = await actor.sees(TextOf.element(locator))
   */
  async sees<T>(question: Question<T>): Promise<T> {
    console.log(`[${this.name}] sees: ${question.constructor.name}`);
    return question.answeredBy(this);
  }
}

/**
 * Interface for Tasks — things an actor can do.
 */
export interface Task {
  performAs(actor: Actor): Promise<void>;
}

/**
 * Interface for Questions — things an actor can check.
 */
export interface Question<T> {
  answeredBy(actor: Actor): Promise<T>;
}
