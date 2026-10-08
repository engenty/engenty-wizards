/** What the thread says, in the wizard's language. `{name}` is filled from the second argument. */

export type Lang = "de" | "en";

const texts = {
  de: {
    nothing: "Hier ist noch kein Wizard verbunden.",
    which: "Welcher Wizard soll es sein?",
    choose: "Auswählen",
    over: "Dieser Durchlauf ist beendet. Mit dem Stichwort beginnt ein neuer.",
    stopped: "Abgebrochen. Mit dem Stichwort beginnt ein neuer Durchlauf.",
    optional: "(freiwillig – „weiter“ überspringt)",
    pickOne: "Bitte eine der Möglichkeiten wählen.",
    pickNumber: "Bitte mit der Nummer antworten.",
    picked: "Gewählt: {list}",
    more: "Noch etwas?",
    done: "Fertig",
    yes: "Ja",
    no: "Nein",
    yesOrNo: "Bitte mit Ja oder Nein antworten.",
    asText: "Bitte als Text antworten.",
    asDate: "Bitte ein Datum, zum Beispiel 24.12.2026.",
    sendPhoto: "Bitte ein Foto schicken.",
    sendFile: "Bitte eine Datei schicken.",
    sendVoice: "Bitte eine Sprachnachricht schicken.",
    another: "Noch eins",
    whereAre: "Bitte den Standort teilen, oder die Adresse schreiben.",
    needed: "Dieses Feld braucht es.",
    screen: "Dafür braucht es den Bildschirm – danach geht es hier weiter.",
    open: "Öffnen",
    working: "{step} … das dauert einen Moment.",
    reviewAsk: "Passt das so?",
    reviewOk: "Passt",
    reviewRedo: "Neue Version",
    reviewWhich: "Was soll neu gemacht werden?",
    reviewNote: "Was soll anders sein?",
    allow: "Erlauben",
    skip: "Überspringen",
    finished: "Fertig! Alles liegt hier:",
    failed: "Der Wizard ist stehengeblieben. Hier geht es weiter:",
    notYet: "Bitte auf dem Bildschirm weitermachen:",
    later: "Der Wizard hat etwas für dich. Hier ist es:",
  },
  en: {
    nothing: "No wizard is connected here yet.",
    which: "Which wizard?",
    choose: "Choose",
    over: "This run is over. The keyword starts a new one.",
    stopped: "Stopped. The keyword starts a new run.",
    optional: "(optional – “skip” leaves it out)",
    pickOne: "Please pick one of the options.",
    pickNumber: "Please answer with the number.",
    picked: "Picked: {list}",
    more: "Anything else?",
    done: "Done",
    yes: "Yes",
    no: "No",
    yesOrNo: "Please answer yes or no.",
    asText: "Please answer as text.",
    asDate: "Please send a date, for example 2026-12-24.",
    sendPhoto: "Please send a photo.",
    sendFile: "Please send a file.",
    sendVoice: "Please send a voice message.",
    another: "One more",
    whereAre: "Please share your location, or write the address.",
    needed: "This field is needed.",
    screen: "This needs the screen – it goes on here afterwards.",
    open: "Open",
    working: "{step} … this takes a moment.",
    reviewAsk: "Is this right?",
    reviewOk: "Looks good",
    reviewRedo: "New version",
    reviewWhich: "What should be made again?",
    reviewNote: "What should be different?",
    allow: "Allow",
    skip: "Skip",
    finished: "Done! Everything is here:",
    failed: "The wizard stopped. It goes on here:",
    notYet: "Please go on on the screen:",
    later: "The wizard has something for you. Here it is:",
  },
} as const;

export type Key = keyof (typeof texts)["de"];

export function say(lang: Lang, key: Key, vars: Record<string, string | number> = {}): string {
  let text: string = texts[lang][key];
  for (const [name, value] of Object.entries(vars)) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}

/** Words that skip an optional field, in either language. */
export const SKIP_WORDS = new Set(["weiter", "skip", "-", "überspringen", "keine", "none"]);

/** Words that end what is being collected (several photos, several picks). */
export const DONE_WORDS = new Set(["fertig", "done", "ok", "passt", "das wars", "that's it"]);

/** Words that stop a run. */
export const STOP_WORDS = new Set(["stop", "stopp", "abbrechen", "cancel", "abbruch", "ende"]);

export const YES_WORDS = new Set(["ja", "yes", "y", "j", "jo", "klar", "yep", "true", "✓"]);
export const NO_WORDS = new Set(["nein", "no", "n", "nö", "nope", "false"]);
