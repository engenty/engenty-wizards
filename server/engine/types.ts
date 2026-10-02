import type { WizardDefinition } from "../../shared/definition.js";
import type { AssetRef, RunAsk, RunState } from "../../shared/run.js";
import type { WorkspaceFile } from "../../shared/workspace.js";
import type { schema } from "../db/client.js";
import type { SaveAssetInput } from "../storage.js";
import type { StoreScope } from "../store/index.js";
import type { AskResult } from "./asks.js";
import type { RunResources } from "./resources.js";
import type { TemplateScope } from "./template.js";

export type ProjectRow = typeof schema.project.$inferSelect;
export type RunRow = typeof schema.run.$inferSelect;

export interface StepContext {
  runId: string;
  ownerId: string;
  /** The current step's id. */
  stepId: string;
  /** What the wizard keeps for the person running it. */
  store: StoreScope;
  def: WizardDefinition;
  /** The workspace the run started with. */
  files: WorkspaceFile[];
  state: RunState;
  scope: TemplateScope;
  project: ProjectRow;
  signal: AbortSignal;
  resources: RunResources;
  emit(type: "tool" | "info", message: string): Promise<void>;
  /**
   * Asks the person and waits for the answer. `null` when nobody is there to answer (a run an
   * MCP client drives).
   */
  ask(ask: Omit<RunAsk, "id" | "at" | "stepId">): Promise<AskResult | null>;
  chargeUsd(usd: number, reason: string): Promise<void>;
  saveAsset(input: Omit<SaveAssetInput, "ownerId" | "runId">): Promise<AssetRef>;
}

/** A step failure the person can read. */
export class StepError extends Error {}
