import {
  clipText,
  type Thread,
  type ThreadLang,
  type ThreadPrompt,
  type ThreadSurface,
} from "@engenty-wizards/plugin-sdk/thread";
import { type Account, Twilio } from "./twilio";

/**
 * SMS as a surface of the thread door: text only. A question with options is numbered lines
 * and the person answers with the number; a place is an address typed; every picture and
 * file is a link; a long text is its gist, the link at the end has the rest.
 */

export const RUNNER = "sms";

/** The field kinds a text can answer; a photo, a file or a signature hands the page to the screen. */
export const ASKS = [
  "text",
  "textarea",
  "number",
  "select",
  "multiselect",
  "date",
  "email",
  "url",
  "toggle",
  "location",
];

/** How long a text may be before its gist goes out instead: a few segments. */
const GIST = 600;

const hints = {
  de: { one: "Antwort: die Nummer", many: "Antwort: die Nummern, mit Komma getrennt" },
  en: { one: "Reply with the number", many: "Reply with the numbers, separated by commas" },
};

/** What the door says, as one text. */
export function toText(prompt: ThreadPrompt, lang: ThreadLang): string {
  switch (prompt.kind) {
    case "text":
      return clipText(prompt.text, GIST);
    case "choice": {
      const lines = prompt.options.map((o, i) => `${i + 1}. ${o.picked ? "✓ " : ""}${o.title}`);
      return `${clipText(prompt.text, GIST)}\n\n${lines.join("\n")}\n\n${hints[lang][prompt.multiple ? "many" : "one"]}`;
    }
    case "location":
      return clipText(prompt.text, GIST);
    case "link":
      return `${clipText(prompt.text, GIST)}\n${prompt.url}`;
    case "media":
      return `${prompt.caption ?? prompt.filename ?? prompt.media}: ${prompt.url}`;
  }
}

export function smsSurface(deps: { account: () => Promise<Account | null> }): ThreadSurface {
  return {
    runner: RUNNER,
    asks: ASKS,
    async send(thread: Thread, prompt: ThreadPrompt) {
      const account = await deps.account();
      if (!account) {
        throw new Error("SMS is not connected.");
      }
      await new Twilio(account).send(thread.id, toText(prompt, thread.state.lang));
    },
  };
}
