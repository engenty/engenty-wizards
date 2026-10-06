import type { Format, ModelClass, Step, WizardDefinition } from "./definition.js";
import type { ConnectionView, ListDef, ListRow } from "./store.js";

export type RunStatus = "waiting_input" | "running" | "done" | "failed" | "cancelled";

export interface AssetRef {
  id: string;
  /** image | video | html | text | json */
  kind: string;
  mime: string;
  name: string;
  /**
   * Media a model made ("generated") or changed ("edited"). Shown with a label wherever it is
   * displayed; the file itself carries the marking in its metadata (EU AI Act, Art. 50).
   */
  ai?: "generated" | "edited";
}

export interface StepOutput {
  text?: string;
  json?: unknown;
  assets?: AssetRef[];
  /** Widgets: what loading it with this run's data showed. */
  widget?: {
    /** Seconds of animation the widget registered for video export; null = a still widget. */
    duration: number | null;
    errors: string[];
  };
  at: string;
}

export interface RunState {
  values: Record<string, unknown>;
  outputs: Record<string, StepOutput>;
  /** Interactive steps answered, oldest first — "back" pops this. */
  history: string[];
  /** Regenerate notes per step. */
  notes: Record<string, string>;
  /** Steps that make several results: the entries (from 0) to make again; the others stay. */
  redo?: Record<string, number[]>;
}

interface AskBase {
  id: string;
  stepId: string;
  /** Why the wizard asks, in the person's language. */
  reason: string;
  at: string;
}

/**
 * A running step asks the person to sign in on a page the wizard's browser has open. What the
 * person types goes into that page; the model never sees it.
 */
export interface LoginAsk extends AskBase {
  kind: "login";
  site: { host: string; title: string };
  /** Inputs found on the page, to fill here instead of clicking into the picture. */
  fields: { id: string; label: string; secret: boolean }[];
}

/** A running step wants to change something in one of the person's accounts and asks first. */
export interface ConfirmAsk extends AskBase {
  kind: "confirm";
  /** The connected service, e.g. "Notion". */
  service: string;
  action: { id: string; summary: string; destructive: boolean };
  /** What would be sent, as readable JSON. */
  input: string;
}

/** What a running step asks the person; the step waits for the answer. */
export type RunAsk = LoginAsk | ConfirmAsk;

/** A question as a step puts it; the runner adds id, step and time. */
export type AskInput =
  | Omit<LoginAsk, "id" | "stepId" | "at">
  | Omit<ConfirmAsk, "id" | "stepId" | "at">;

/**
 * `fill` and `done` answer a sign-in (remember = keep the sign-in); `done` also allows a change
 * (remember = allow that action for the rest of the run); `skip` declines either.
 */
export type AskAnswer =
  | { type: "fill"; values: Record<string, string>; remember?: boolean }
  | { type: "done"; remember?: boolean }
  | { type: "skip" };

/** One thing the person does in the wizard's browser while it waits for them. */
export type BrowserAct =
  | { type: "click"; x: number; y: number }
  | { type: "type"; text: string }
  | { type: "key"; key: "Enter" | "Tab" | "Backspace" | "Escape" }
  | { type: "scroll"; dy: number };

/** A stored list the current step shows. */
export interface ShownList {
  def: ListDef;
  rows: ListRow[];
  formats: Format[];
  label: string | null;
}

/**
 * What a step reports while it works, in words for each language: the runtime writes the German
 * line into the run's log, a runner shows it in the language the person reads.
 */
export const RUN_NOTES = {
  batchDone: { de: "{done} von {total} fertig", en: "{done} of {total} done" },
  editing: { de: "Bearbeitet {n} von {total}", en: "Editing {n} of {total}" },
  filming: { de: "Dreht {n} von {total}", en: "Filming {n} of {total}" },
  clipsRendering: {
    de: "{count} Clips werden gerendert – das dauert einige Minuten.",
    en: "Rendering {count} clips – this takes a few minutes.",
  },
  videoRendering: {
    de: "Das Video wird gerendert – das dauert meist 1–3 Minuten.",
    en: "Rendering the video – this usually takes 1–3 minutes.",
  },
  photo: { de: "Sieht sich Foto {n} von {total} an", en: "Looking at photo {n} of {total}" },
  listen: { de: "Hört „{label}“ an …", en: "Listening to “{label}” …" },
  listenFailed: {
    de: "„{label}“ konnte nicht verschriftlicht werden.",
    en: "“{label}” could not be written down.",
  },
  filmCutting: {
    de: "Der Film wird geschnitten – das dauert etwa eine Minute.",
    en: "Cutting the film – this takes about a minute.",
  },
  filmProgress: { de: "{pct} % geschnitten", en: "{pct} % cut" },
  filmError: { de: "Der Film meldet: {detail}", en: "The film reports: {detail}" },
  widgetError: {
    de: "Das Widget meldet einen Fehler: {detail}",
    en: "The widget reports an error: {detail}",
  },
  mcpConnected: { de: "Verbunden mit {names}", en: "Connected to {names}" },
  mcpUnreachable: {
    de: "MCP-Server nicht erreichbar: {detail}",
    en: "MCP server unreachable: {detail}",
  },
  reads: { de: "Liest {name}", en: "Reading {name}" },
  readsMany: { de: "Liest {count} Dokumente", en: "Reading {count} documents" },
  opens: { de: "Öffnet {name}", en: "Opening {name}" },
  clicks: { de: "Klickt im Browser", en: "Clicking in the browser" },
  types: { de: "Tippt im Browser", en: "Typing in the browser" },
  looksAtPage: { de: "Sieht sich die Seite an", en: "Looking at the page" },
  waitsForSignIn: {
    de: "Wartet auf deine Anmeldung bei {name}",
    en: "Waiting for you to sign in at {name}",
  },
  downloads: { de: "Lädt {name} herunter", en: "Downloading {name}" },
  runs: { de: "Führt aus: {command}", en: "Running: {command}" },
  python: { de: "Führt Python aus", en: "Running Python" },
  drawing: { de: "Zeichnet ein Bild", en: "Drawing an image" },
  writesPage: { de: "Schreibt die Seite „{title}“", en: "Writing the page “{title}”" },
  searchesDocuments: {
    de: "Sucht in den Dokumenten: {query}",
    en: "Searching the documents: {query}",
  },
  searchesKnowledge: {
    de: "Sucht in Wissen: {query} – {relevant} von {candidates} passen",
    en: "Searching the knowledge: {query} – {relevant} of {candidates} fit",
  },
  listsKnowledge: { de: "Listet Wissen", en: "Listing the knowledge" },
  searchesMail: { de: "Durchsucht {label}", en: "Searching {label}" },
  savesReceipts: {
    de: "Speichert {count} Belege aus {label}",
    en: "Saving {count} receipts from {label}",
  },
  remembers: { de: "Merkt sich {title}", en: "Remembering {title}" },
  files: { de: "Legt {count} Dateien ab", en: "Filing {count} files" },
} as const satisfies Record<string, { de: string; en: string }>;
export type RunNoteCode = keyof typeof RUN_NOTES;

/** A line of `RUN_NOTES` with what goes into its gaps. */
export interface RunNote {
  code: RunNoteCode;
  params?: Record<string, string | number>;
}

/** A note in a language, its gaps filled. */
export function noteText(note: RunNote, lang: "de" | "en"): string {
  const line: { de: string; en: string } | undefined = RUN_NOTES[note.code];
  if (!line) {
    return "";
  }
  return line[lang].replace(/\{(\w+)\}/g, (gap, key: string) =>
    note.params?.[key] === undefined ? gap : String(note.params[key]),
  );
}

export interface RunEvent {
  id: number;
  at: string;
  stepId: string | null;
  type: "step_started" | "step_done" | "tool" | "info" | "error";
  /** In German, as the run's log keeps it. */
  message: string;
  /** The same as a note a runner shows in the person's language; null for free text. */
  note?: RunNote | null;
  /** A picture of the run this is about (a photo being looked at, an image just made). */
  asset?: string | null;
}

export interface RunView {
  id: string;
  status: RunStatus;
  mode: "test" | "live";
  wizard: Pick<WizardDefinition, "title" | "description" | "avatar" | "intro">;
  /** The step the person is on (interactive) or the one running. */
  step: Step | null;
  values: Record<string, unknown>;
  /** What fields of the current page start with, from earlier steps (`prefill`). */
  prefill: Record<string, unknown>;
  /** Choices of the current page that lead to a step without a model here, by field id. */
  closed: Record<string, ClosedChoice>;
  outputs: Record<string, StepOutput>;
  /** Steps whose outputs the current step shows, with their definitions. */
  shown: { step: Step; output: StepOutput | null; formats: Format[]; label: string | null }[];
  progress: { done: number; total: number };
  canBack: boolean;
  error: string | null;
  events: RunEvent[];
  brand: BrandView;
  /** What the running step asks the person right now. */
  ask: RunAsk | null;
  /** Stored lists the current step shows (a page's list fields, a review, the result). */
  lists: ShownList[];
  /** The wizard's connections with what the person has connected. */
  connections: ConnectionView[];
  /** The wizard keeps things for the person between runs (lists, files, accounts). */
  keeps: boolean;
  /** Set once the result is shared. */
  shareUrl: string | null;
  /** When the run and its shared link are deleted; null = kept. */
  expiresAt: string | null;
}

/** A shared result: what `/s/<token>` shows. Never the person's answers. */
export interface ShareView {
  token: string;
  title: string;
  message: string | null;
  wizard: Pick<WizardDefinition, "title" | "description" | "avatar">;
  brand: BrandView;
  shown: RunView["shown"];
  createdAt: string;
  expiresAt: string | null;
  /** The wizard's public link, to make your own — when it is published and open. */
  wizardUrl: string | null;
}

export interface BrandView {
  name: string;
  accent: string | null;
  logoUrl: string | null;
}

export interface PublicWizard {
  token: string;
  title: string;
  description: string;
  avatar: string;
  intro: string | null;
  brand: BrandView;
  turnstileSiteKey: string | null;
  available: boolean;
  unavailableReason: string | null;
}

/** What a step is expected to cost, in credits. `high` is the 90th percentile once measured. */
export interface StepEstimate {
  credits: number;
  high: number;
  /** From at least five runs of this version; otherwise from a formula. */
  measured: boolean;
}

/** What a run is expected to cost. `available` is false where no credits are involved. */
/** A model class a wizard needs that this runtime cannot serve, with the steps that call it. */
export interface MissingModel {
  cls: ModelClass;
  /** Why the class cannot run, as the person reads it. */
  problem: string;
  steps: { id: string; title: string }[];
  /** A step that needs it lies on every path: the run cannot start. */
  blocking: boolean;
}

/** A page's choice whose values lead to a step this runtime has no model for. */
export interface ClosedChoice {
  /** The options (or a toggle's true / false) that lead there; empty = the field as a whole. */
  values: (string | boolean)[];
  /** What is missing on the way. */
  classes: ModelClass[];
}

export interface RunEstimate {
  available: boolean;
  credits: number;
  /** Credits held when a run starts. */
  reserve: number;
  steps: Record<string, StepEstimate>;
}
