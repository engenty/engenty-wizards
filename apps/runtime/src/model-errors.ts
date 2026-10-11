import { noteText, type RunNote } from "@engenty-wizards/shared/run";

/**
 * A failure the person reads, given as a note of `RUN_NOTES` where it has one: a run shows it in
 * the wizard's language, the message keeps the German line for the log. Free text has no note.
 */
export class NotedError extends Error {
  readonly note: RunNote | null;

  constructor(said: string | RunNote) {
    super(typeof said === "string" ? said : noteText(said, "de"));
    this.note = typeof said === "string" ? null : said;
  }
}

/** A class has nothing to run on: no key, no account, no installed client — the person can fix it in the settings. */
export class ModelUnavailableError extends NotedError {}

/** The note a failure carries, or null. */
export function noteOf(err: unknown): RunNote | null {
  return err instanceof NotedError ? err.note : null;
}

/** A failure in a language: its note where it has one, else its message as it is. */
export function errorText(err: unknown, lang: "de" | "en"): string {
  const note = noteOf(err);
  return note ? noteText(note, lang) : ((err as Error)?.message ?? String(err));
}
