import type { Format, Step, WizardDefinition } from "./definition.js";
import type { ConnectionView, ListDef, ListRow } from "./store.js";

export type RunStatus = "waiting_input" | "running" | "done" | "failed" | "cancelled";

export interface AssetRef {
  id: string;
  /** image | video | html | text | json */
  kind: string;
  mime: string;
  name: string;
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
}

/**
 * A running step asks the person to sign in on a page the wizard's browser has open. What the
 * person types goes into that page; the model never sees it.
 */
export interface RunAsk {
  id: string;
  stepId: string;
  kind: "login";
  /** Why the wizard asks, in the person's language. */
  reason: string;
  site: { host: string; title: string };
  /** Inputs found on the page, to fill here instead of clicking into the picture. */
  fields: { id: string; label: string; secret: boolean }[];
  at: string;
}

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

export interface RunEvent {
  id: number;
  at: string;
  stepId: string | null;
  type: "step_started" | "step_done" | "tool" | "info" | "error";
  message: string;
}

export interface RunView {
  id: string;
  status: RunStatus;
  mode: "test" | "live";
  wizard: Pick<WizardDefinition, "title" | "description" | "avatar" | "intro">;
  /** The step the person is on (interactive) or the one running. */
  step: Step | null;
  values: Record<string, unknown>;
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
