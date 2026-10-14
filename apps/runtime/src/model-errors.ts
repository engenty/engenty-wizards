import type { Lang } from "@engenty-wizards/shared/definition";
import { noteText, type RunNote } from "@engenty-wizards/shared/run";

/**
 * A failure the person reads, given as a note of `RUN_NOTES` where it has
 * one: a run shows it in the wizard's language, a response in the asker's, and the message keeps
 * the English line for the log. Free text has no note.
 */
export class NotedError extends Error {
  readonly note: RunNote | null;

  constructor(said: string | RunNote) {
    super(typeof said === "string" ? said : noteText(said, "en"));
    this.note = typeof said === "string" ? null : said;
  }
}

/** A class has nothing to run on: no key, no account, no installed client — the person can fix it in the settings. */
export class ModelUnavailableError extends NotedError {}

/** The note a failure carries, or null. */
export function noteOf(err: unknown): RunNote | null {
  return err instanceof NotedError ? err.note : null;
}

/** What a failure says, to pass on: its note where it has one, else its message. */
export function saidOf(err: unknown): string | RunNote {
  return noteOf(err) ?? (err as Error)?.message ?? String(err);
}

/** A failure in a language: its note where it has one, else its message as it is. */
export function errorText(err: unknown, lang: Lang): string {
  const note = noteOf(err);
  return note ? noteText(note, lang) : ((err as Error)?.message ?? String(err));
}
