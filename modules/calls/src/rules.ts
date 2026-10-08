import type { PluginRunReport } from "@engenty-wizards/plugin-sdk";
import { clipText, type ThreadLang } from "@engenty-wizards/plugin-sdk/thread";

/**
 * What the model works with on a call: its tools (one per command of the run), its rules in
 * the wizard's language, and the state of the run as text, which it reads after every change.
 */

export const RUNNER = "call";

/** The field kinds a voice can answer; the rest is texted as a link to the run page. */
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

export const VOICES: Record<ThreadLang, string> = { de: "marin", en: "marin" };

const object = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

export const CALL_TOOLS = [
  {
    type: "function",
    name: "get_state",
    description:
      "What the run waits for right now: the page with its fields (which are answered, which are still open, which need the screen), the review, or what the wizard is working on. Call it when unsure, and after the state changed.",
    parameters: object({}),
  },
  {
    type: "function",
    name: "set_field",
    description:
      "Keeps the person's answer to one field of the current page. Call it once per field as soon as the person answered; for a choice give one of the options exactly.",
    parameters: object(
      {
        field: { type: "string", description: "The field's id from the state." },
        value: {
          description:
            "The answer: a string, a number, true/false for a toggle, or an array of options for a multiple choice.",
        },
      },
      ["field", "value"],
    ),
  },
  {
    type: "function",
    name: "submit_page",
    description:
      "Sends the current page once every required field that can be answered by voice has a value.",
    parameters: object({}),
  },
  {
    type: "function",
    name: "accept_review",
    description: "Accepts what the wizard made, when the person is happy with it.",
    parameters: object({}),
  },
  {
    type: "function",
    name: "regenerate",
    description: "Asks the wizard to make one of the shown outputs again, with what should change.",
    parameters: object(
      {
        target: { type: "string", description: "The step id of the output, from the state." },
        note: { type: "string", description: "What should change, in the person's words." },
      },
      ["target", "note"],
    ),
  },
  {
    type: "function",
    name: "answer_ask",
    description:
      "Answers the question a running step asks before it changes something in a connected account: allow it, or skip it.",
    parameters: object({ allow: { type: "boolean" } }, ["allow"]),
  },
  {
    type: "function",
    name: "send_link",
    description:
      "Texts the person a link to the run on their phone: for a page that needs the screen (a photo, a file, a signature), and for the result at the end. Say that a text is on its way.",
    parameters: object({}),
  },
  {
    type: "function",
    name: "go_back",
    description: "Goes back to the page before, when the person wants to change an earlier answer.",
    parameters: object({}),
  },
  {
    type: "function",
    name: "choose_wizard",
    description:
      "Starts one of the wizards offered on this number, by its name, once the person said which.",
    parameters: object({ name: { type: "string" } }, ["name"]),
  },
  {
    type: "function",
    name: "hang_up",
    description: "Ends the call, after saying goodbye.",
    parameters: object({}),
  },
] as const;

export interface About {
  title: string;
  description?: string;
}

/** The rules the model speaks by. `lobby`: the wizards to choose from, when more than one is on. */
export function instructions(lang: ThreadLang, about: About | null, lobby: string[]): string {
  const de = lang === "de";
  const who = about
    ? [`${de ? "Du bist" : "You are"} ${about.title}.`, about.description].filter(Boolean).join(" ")
    : de
      ? "Du bist der Assistent dieser Nummer."
      : "You are the assistant on this number.";
  const choose = lobby.length
    ? de
      ? `Auf dieser Nummer gibt es mehrere Wizards: ${lobby.join(", ")}. Frag zuerst, welcher es sein soll, und rufe dann choose_wizard auf.`
      : `This number offers several wizards: ${lobby.join(", ")}. Ask first which one it should be, then call choose_wizard.`
    : "";
  const none =
    !about && !lobby.length
      ? de
        ? "Hier ist noch kein Wizard eingerichtet: sag das in einem Satz und beende das Gespräch mit hang_up."
        : "No wizard is set up here yet: say so in one sentence and end the call with hang_up."
      : "";
  const rules = de
    ? [
        "Du führst ein Telefongespräch, das einen Wizard Schritt für Schritt ausfüllt. Die Person hat keinen Bildschirm vor sich: nur deine Stimme.",
        "Sprich Deutsch, kurz und freundlich. Ein Satz, dann die nächste Frage. Begrüße die Person mit einem Satz und sag, worum es geht.",
        "Frag ein Feld nach dem anderen, in der Reihenfolge des Zustands. Nach jeder Antwort rufst du set_field auf. Sind alle Felder beantwortet, die du per Sprache füllen kannst, rufst du submit_page auf.",
        "Bei einer Auswahl nennst du die Möglichkeiten (höchstens vier auf einmal) und gibst genau eine davon weiter.",
        "E-Mail-Adressen, Links und Zahlen wiederholst du zur Bestätigung, bevor du sie weitergibst.",
        "Ein Feld, das den Bildschirm braucht (ein Foto, eine Datei, eine Unterschrift), kann die Person nur über einen Link ausfüllen: sag das, rufe send_link auf, und warte, bis der Zustand sich ändert.",
        "Während der Wizard arbeitet, sagst du in einem Satz, was er gerade tut, und wartest. Erfinde nichts.",
        "Bei einer Prüfung liest du den Text kurz zusammengefasst vor und fragst, ob er passt. Dann accept_review, oder regenerate mit dem Wunsch der Person.",
        "Am Ende sagst du, was entstanden ist, rufst send_link auf, damit die Person alles als Link bekommt, verabschiedest dich und rufst hang_up auf.",
      ]
    : [
        "You hold a phone conversation that fills in a wizard step by step. The person has no screen: only your voice.",
        "Speak English, short and friendly. One sentence, then the next question. Greet the person in one sentence and say what this is about.",
        "Ask one field at a time, in the order of the state. After each answer call set_field. When every field you can fill by voice is answered, call submit_page.",
        "For a choice, name the options (at most four at a time) and pass exactly one of them on.",
        "Read e-mail addresses, links and numbers back before passing them on.",
        "A field that needs the screen (a photo, a file, a signature) can only be filled through a link: say so, call send_link, and wait until the state changes.",
        "While the wizard works, say in one sentence what it is doing and wait. Never make anything up.",
        "At a review, sum the text up in a few words and ask whether it fits. Then accept_review, or regenerate with what the person wants changed.",
        "At the end, say what was made, call send_link so the person has it all as a link, say goodbye and call hang_up.",
      ];
  return [who, choose, none, "", ...rules].filter((line) => line !== undefined).join("\n");
}

/** The run as text for the model: the page with every field and what it knows, or what else it waits for. */
export function stateText(
  report: PluginRunReport | null,
  draft: Record<string, unknown>,
  lobby: string[],
  asks: Set<string>,
): string {
  if (!report) {
    return lobby.length
      ? `[state]\nNo wizard chosen yet. Offered: ${lobby.join(", ")}. Ask which, then choose_wizard.`
      : "[state]\nNo wizard is set up on this number.";
  }
  const lines = [`[state]`, `Status: ${report.status}.`];
  const w = report.waitingFor;
  if (report.status === "done") {
    lines.push("The wizard is done. Say what was made, send_link, say goodbye, hang_up.");
  } else if (report.status === "failed") {
    lines.push(`The wizard stopped: ${report.error ?? "an error"}. Say so, send_link, hang_up.`);
  } else if (!w) {
    lines.push(
      `The wizard is working on "${report.step?.title ?? "…"}". Say so in a sentence and wait; the state comes again when it is done.`,
    );
  } else if ("page" in w) {
    lines.push(`Page "${w.title}" (id ${w.page}). Fields, in order:`);
    for (const f of w.fields) {
      if (f.shown === false) {
        continue;
      }
      const value = f.id in draft ? draft[f.id] : f.value;
      const has = value !== undefined && value !== null && value !== "";
      const kind = f.options?.length ? `${f.kind}: ${f.options.join(" | ")}` : f.kind;
      const how = asks.has(f.kind) ? "" : " — needs the screen: send_link";
      lines.push(
        `- ${f.id} "${f.label}" (${kind}${f.required ? ", required" : ""}${how}): ${has ? `answered: ${JSON.stringify(value)}` : "open"}${f.help ? ` — ${f.help}` : ""}`,
      );
    }
  } else if ("review" in w) {
    lines.push(`Review "${w.title}" (id ${w.review}) of: ${w.show.join(", ")}.`);
    for (const output of report.outputs.filter((o) => w.show.includes(o.stepId))) {
      lines.push(
        `Output ${output.stepId} "${output.title}": ${output.text ? clipText(output.text, 1200) : output.json ? clipText(output.json, 600) : "(not text: a file)"}`,
      );
    }
    lines.push("Ask whether it fits: accept_review, or regenerate with target and note.");
  } else if (w.kind === "confirm") {
    lines.push(
      `Question (id ${w.ask}): ${w.reason} — ${w.action}. answer_ask with allow true or false.`,
    );
  } else {
    lines.push("A sign-in is needed on the screen: send_link and wait.");
  }
  const made = report.outputs.filter((o) => o.text && (!w || !("review" in w)));
  if (made.length && report.status === "done") {
    for (const output of made.slice(-2)) {
      lines.push(`Made "${output.title}": ${clipText(output.text ?? "", 600)}`);
    }
  }
  return lines.join("\n");
}
