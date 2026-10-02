import type { Format, Step, WizardDefinition } from "./definition.js";

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
