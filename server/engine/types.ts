import type { WizardDefinition } from "../../shared/definition.js";
import type { AssetRef, RunState } from "../../shared/run.js";
import type { schema } from "../db/client.js";
import type { SaveAssetInput } from "../storage.js";
import type { RunResources } from "./resources.js";
import type { TemplateScope } from "./template.js";

export type ProjectRow = typeof schema.project.$inferSelect;
export type RunRow = typeof schema.run.$inferSelect;

export interface StepContext {
  runId: string;
  ownerId: string;
  def: WizardDefinition;
  state: RunState;
  scope: TemplateScope;
  project: ProjectRow;
  signal: AbortSignal;
  resources: RunResources;
  emit(type: "tool" | "info", message: string): Promise<void>;
  chargeUsd(usd: number, reason: string): Promise<void>;
  saveAsset(input: Omit<SaveAssetInput, "ownerId" | "runId">): Promise<AssetRef>;
}

/** A step failure the person can read. */
export class StepError extends Error {}
