import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  type Format,
  formatsFor,
  LIST_FORMATS,
  listRef,
  nextStepId,
  type Step,
  type WizardDefinition,
} from "../../shared/definition.js";
import type { RunState, RunView, ShownList } from "../../shared/run.js";
import type { ListDef, ListRow } from "../../shared/store.js";
import type { WorkspaceFile } from "../../shared/workspace.js";
import { canSpend, charge, usdToMicros } from "../billing/credits.js";
import { connectionViews } from "../connectors/index.js";
import { db, schema } from "../db/client.js";
import { env } from "../env.js";
import { ModelUnavailableError } from "../models.js";
import { saveAsset } from "../storage.js";
import { listRows, scopeOf } from "../store/index.js";
import { hasFfmpeg } from "../widgets/render.js";
import { askPerson, clearStaleAsk, unattended } from "./asks.js";
import { emitEvent, recentEvents, signalChanged } from "./events.js";
import { readPageInput } from "./input.js";
import { releaseResources, resourcesFor } from "./resources.js";
import { runAutomaticStep } from "./steps.js";
import type { ProjectRow, RunRow, StepContext } from "./types.js";
import { StepError } from "./types.js";

/** A command the run cannot take in its current state. */
export class RunConflict extends Error {}
export class RunInputError extends Error {
  constructor(readonly errors: { field: string; message: string }[]) {
    super("Bitte die markierten Felder prüfen.");
  }
}

const active = new Map<string, AbortController>();

async function loadRun(runId: string): Promise<RunRow | undefined> {
  return db.query.run.findFirst({ where: eq(schema.run.id, runId) });
}

async function loadProject(run: RunRow): Promise<ProjectRow> {
  const w = await db.query.wizard.findFirst({ where: eq(schema.wizard.id, run.wizardId) });
  const p = w && (await db.query.project.findFirst({ where: eq(schema.project.id, w.projectId) }));
  if (!p) {
    throw new Error("project missing");
  }
  return p;
}

async function updateRun(runId: string, patch: Partial<typeof schema.run.$inferInsert>) {
  await db
    .update(schema.run)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.run.id, runId));
  signalChanged(runId);
}

function stepOf(def: WizardDefinition, id: string | null): Step | undefined {
  return id ? def.steps.find((s) => s.id === id) : undefined;
}

function friendly(err: unknown): string {
  if (err instanceof StepError || err instanceof ModelUnavailableError) {
    return err.message;
  }
  const msg = (err as Error)?.message ?? String(err);
  if (/rate.?limit|429/i.test(msg)) {
    return "Der KI-Dienst ist gerade ausgelastet. Bitte gleich noch einmal versuchen.";
  }
  if (/timeout|timed out/i.test(msg)) {
    return "Der Schritt hat zu lange gedauert. Bitte noch einmal versuchen.";
  }
  // The platform's own provider account (budget, quota, key): nothing the person can fix.
  if (
    /budget|quota|insufficient|billing|credit balance|api key|unauthori[sz]ed|401|403/i.test(msg)
  ) {
    return "Der KI-Dienst ist gerade nicht erreichbar. Bitte später noch einmal versuchen.";
  }
  return `Dieser Schritt ist fehlgeschlagen: ${msg.slice(0, 300)}`;
}

// --- creating & driving ------------------------------------------------------

export async function createRun(input: {
  wizardId: string;
  ownerId: string;
  definition: WizardDefinition;
  files: WorkspaceFile[];
  version: number | null;
  mode: "test" | "live";
  visitorId?: string | null;
  userId?: string | null;
  ipHash?: string | null;
}): Promise<string> {
  const id = nanoid(18);
  const first = input.definition.steps[0];
  const state: RunState = { values: {}, outputs: {}, history: [], notes: {} };
  await db.insert(schema.run).values({
    id,
    wizardId: input.wizardId,
    ownerId: input.ownerId,
    definition: input.definition,
    files: input.files,
    version: input.version,
    mode: input.mode,
    visitorId: input.visitorId ?? null,
    userId: input.userId ?? null,
    ipHash: input.ipHash ?? null,
    status: first.type === "page" ? "waiting_input" : "running",
    cursor: first.id,
    state,
    // Without an account nobody can come back for a result later: it is kept a week.
    expiresAt:
      input.mode === "live"
        ? new Date(Date.now() + env.limits.resultTtlDays * 24 * 60 * 60 * 1000)
        : null,
  });
  if (first.type !== "page") {
    kick(id);
  }
  return id;
}

export function kick(runId: string) {
  if (active.has(runId)) {
    return;
  }
  const abort = new AbortController();
  active.set(runId, abort);
  drive(runId, abort.signal)
    .catch(async (err) => {
      console.error(`[run ${runId}]`, err);
      await updateRun(runId, { status: "failed", error: friendly(err) }).catch(() => undefined);
    })
    .finally(async () => {
      active.delete(runId);
      await releaseResources(runId);
      signalChanged(runId);
    });
}

/** The wizard's lists with the person's rows, by list id. */
async function storedLists(run: RunRow): Promise<Record<string, { def: ListDef; rows: ListRow[] }>> {
  const scope = scopeOf(run);
  const out: Record<string, { def: ListDef; rows: ListRow[] }> = {};
  for (const def of run.definition.lists ?? []) {
    out[def.id] = { def, rows: await listRows(scope, def.id) };
  }
  return out;
}

async function makeContext(
  run: RunRow,
  project: ProjectRow,
  state: RunState,
  signal: AbortSignal,
): Promise<StepContext> {
  const store = scopeOf(run);
  const resources = resourcesFor(run.id);
  resources.bind(store);
  const stepId = run.cursor ?? "";
  return {
    runId: run.id,
    ownerId: run.ownerId,
    stepId,
    store,
    def: run.definition,
    files: run.files,
    state,
    scope: {
      def: run.definition,
      state,
      brand: { name: project.brand.name, details: project.brand.details },
      lists: await storedLists(run),
    },
    project,
    signal,
    resources,
    ask: (ask) =>
      unattended.has(run.id)
        ? Promise.resolve(null)
        : askPerson(run.id, { ...ask, stepId }, signal),
    emit: (type, message) => emitEvent(run.id, run.cursor, type, message),
    chargeUsd: async (usd, reason) => {
      const micros = usdToMicros(usd);
      if (micros <= 0) {
        return;
      }
      await charge(run.ownerId, micros, reason, run.id);
      await db
        .update(schema.run)
        .set({ costMicros: sql`${schema.run.costMicros} + ${micros}` })
        .where(eq(schema.run.id, run.id));
    },
    saveAsset: (input) =>
      saveAsset({
        ...input,
        ownerId: run.ownerId,
        runId: run.id,
        stepId: input.stepId ?? run.cursor,
      }),
  };
}

async function drive(runId: string, signal: AbortSignal) {
  await clearStaleAsk(runId);
  while (!signal.aborted) {
    const run = await loadRun(runId);
    if (run?.status !== "running") {
      return;
    }
    const def = run.definition;
    const step = stepOf(def, run.cursor);
    if (!step) {
      await updateRun(runId, { status: "done" });
      return;
    }
    if (step.type === "result") {
      await updateRun(runId, { status: "done" });
      return;
    }
    if (step.type === "page" || step.type === "review") {
      await updateRun(runId, { status: "waiting_input" });
      return;
    }
    if (!(await canSpend(run.ownerId))) {
      const message = "Dieser Wizard hat gerade kein Guthaben mehr. Bitte später erneut versuchen.";
      await emitEvent(runId, step.id, "error", message);
      await updateRun(runId, { status: "failed", error: message });
      return;
    }
    await emitEvent(runId, step.id, "step_started", step.working ?? step.title);
    const project = await loadProject(run);
    const state = structuredClone(run.state);
    try {
      const output = await runAutomaticStep(step, await makeContext(run, project, state, signal));
      if (signal.aborted) {
        return;
      }
      state.outputs[step.id] = output;
      delete state.notes[step.id];
      const cursor = nextStepId(def, step.id, state.values);
      await updateRun(runId, { state, cursor, status: cursor ? "running" : "done", error: null });
      await emitEvent(runId, step.id, "step_done", step.title);
    } catch (err) {
      if (signal.aborted) {
        return;
      }
      console.error(`[run ${runId} step ${step.id}]`, err);
      const message = friendly(err);
      await emitEvent(runId, step.id, "error", message);
      await updateRun(runId, { status: "failed", error: message });
      return;
    }
  }
}

/** Runs a restart left mid-step go on where they were. */
export async function resumeInterruptedRuns() {
  const rows = await db
    .select({ id: schema.run.id })
    .from(schema.run)
    .where(eq(schema.run.status, "running"));
  for (const r of rows) {
    kick(r.id);
  }
}

// --- commands ----------------------------------------------------------------

async function requireWaiting(runId: string, stepId: string) {
  const run = await loadRun(runId);
  if (!run) {
    throw new RunConflict("Run not found");
  }
  if (run.status !== "waiting_input" && run.status !== "done") {
    throw new RunConflict("Der Wizard arbeitet gerade.");
  }
  if (run.cursor !== stepId) {
    throw new RunConflict("Diese Seite ist nicht mehr aktuell.");
  }
  return run;
}

export async function submitPage(runId: string, stepId: string, input: Record<string, unknown>) {
  const run = await requireWaiting(runId, stepId);
  const step = stepOf(run.definition, stepId);
  if (step?.type !== "page") {
    throw new RunConflict("Not a page");
  }
  const { values, errors } = readPageInput(step, input);
  if (errors.length) {
    throw new RunInputError(errors);
  }
  const connections = step.fields.some((f) => f.kind === "connection")
    ? await connectionViews(run.definition.connections ?? [], scopeOf(run))
    : [];
  for (const field of step.fields) {
    if (field.kind === "image" || field.kind === "file") {
      const value = values[field.id];
      for (const id of Array.isArray(value) ? value : value ? [value] : []) {
        const asset = await db.query.asset.findFirst({ where: eq(schema.asset.id, String(id)) });
        if (asset?.runId !== runId) {
          throw new RunInputError([{ field: field.id, message: "Datei nicht gefunden" }]);
        }
      }
    }
    if (field.kind === "connection") {
      // What the step later reads as {{field}} is the connected account, as the server knows it.
      const account = connections.find((c) => c.id === field.connection)?.account;
      if (account) {
        values[field.id] = account.label;
      } else if (field.required) {
        throw new RunInputError([{ field: field.id, message: "Bitte zuerst verbinden" }]);
      }
    }
  }
  const state = structuredClone(run.state);
  state.values = { ...state.values, ...values };
  // Fields left empty on a revisited page are cleared, not kept from before.
  for (const field of step.fields) {
    if (!(field.id in values)) {
      delete state.values[field.id];
    }
  }
  state.history.push(stepId);
  const cursor = nextStepId(run.definition, stepId, state.values);
  await updateRun(runId, { state, cursor, status: "running", error: null });
  kick(runId);
}

export type ReviewAction =
  | { type: "accept"; edits?: Record<string, string> }
  | { type: "regenerate"; target: string; note: string };

export async function reviewStep(runId: string, stepId: string, action: ReviewAction) {
  const run = await requireWaiting(runId, stepId);
  const step = stepOf(run.definition, stepId);
  if (step?.type !== "review") {
    throw new RunConflict("Not a review");
  }
  const state = structuredClone(run.state);
  if (action.type === "accept") {
    for (const [target, text] of Object.entries(action.edits ?? {})) {
      if (step.edit && step.show.includes(target) && state.outputs[target]) {
        state.outputs[target] = { ...state.outputs[target], text: String(text).slice(0, 50_000) };
      }
    }
    state.history.push(stepId);
    const cursor = nextStepId(run.definition, stepId, state.values);
    await updateRun(runId, { state, cursor, status: "running", error: null });
    kick(runId);
    return;
  }
  if (!step.show.includes(action.target)) {
    throw new RunConflict("Unknown target");
  }
  state.notes[action.target] = action.note.slice(0, 2000) || "Bitte eine neue Variante.";
  await updateRun(runId, { state, cursor: action.target, status: "running", error: null });
  await emitEvent(runId, action.target, "info", "Wird neu erstellt …");
  kick(runId);
}

export async function goBack(runId: string) {
  const run = await loadRun(runId);
  if (
    !run ||
    (run.status !== "waiting_input" && run.status !== "done" && run.status !== "failed")
  ) {
    throw new RunConflict("Der Wizard arbeitet gerade.");
  }
  const state = structuredClone(run.state);
  const previous = state.history.pop();
  if (!previous) {
    throw new RunConflict("Kein vorheriger Schritt.");
  }
  await updateRun(runId, { state, cursor: previous, status: "waiting_input", error: null });
}

export async function retry(runId: string) {
  const run = await loadRun(runId);
  if (run?.status !== "failed") {
    throw new RunConflict("Nothing to retry");
  }
  await updateRun(runId, { status: "running", error: null });
  kick(runId);
}

export async function cancel(runId: string) {
  active.get(runId)?.abort();
  await updateRun(runId, { status: "cancelled" });
}

// --- view --------------------------------------------------------------------

/** The formats a deliverable can really be downloaded in: a still widget has no video. */
export async function availableFormats(step: Step, run: RunRow, wanted?: Format[]) {
  const possible = formatsFor(step);
  let formats = wanted ? wanted.filter((f) => possible.includes(f)) : possible;
  if (step.type === "widget" && formats.includes("mp4")) {
    const output = run.state.outputs[step.id];
    if (!output?.widget?.duration || !(await hasFfmpeg())) {
      formats = formats.filter((f) => f !== "mp4");
    }
  }
  // A zip holds the files a step collected; without any there is nothing to zip.
  if (formats.includes("zip") && !run.state.outputs[step.id]?.assets?.some((a) => a.kind === "file")) {
    formats = formats.filter((f) => f !== "zip");
  }
  return formats;
}

export async function runView(run: RunRow, brand: RunView["brand"]): Promise<RunView> {
  const def = run.definition;
  const step = stepOf(def, run.cursor) ?? null;
  const index = step ? def.steps.indexOf(step) : def.steps.length;
  const refs =
    step?.type === "review"
      ? step.show
      : step?.type === "result"
        ? [...new Set(step.deliverables.map((d) => d.from))]
        : [];
  const shownIds = refs.filter((ref) => !listRef(ref));
  const listIds = [
    ...refs.map(listRef),
    ...(step?.type === "page" ? step.fields.map((f) => (f.kind === "list" ? f.list : null)) : []),
  ].filter((id): id is string => Boolean(id));
  const stored = listIds.length ? await storedLists(run) : {};
  const lists: ShownList[] = [...new Set(listIds)]
    .filter((id) => stored[id])
    .map((id) => {
      const deliverable =
        step?.type === "result" ? step.deliverables.find((d) => listRef(d.from) === id) : undefined;
      return {
        ...stored[id],
        formats: deliverable ? deliverable.formats.filter((f) => LIST_FORMATS.includes(f)) : [],
        label: deliverable?.label ?? null,
      };
    });
  const shown = await Promise.all(
    shownIds
      .map((id) => stepOf(def, id))
      .filter((s): s is Step => Boolean(s))
      .map(async (s) => {
        const deliverable =
          step?.type === "result" ? step.deliverables.find((d) => d.from === s.id) : undefined;
        return {
          step: s,
          output: run.state.outputs[s.id] ?? null,
          formats: await availableFormats(s, run, deliverable?.formats),
          label: deliverable?.label ?? null,
        };
      }),
  );
  return {
    id: run.id,
    status: run.status,
    mode: run.mode,
    wizard: {
      title: def.title,
      description: def.description,
      avatar: def.avatar,
      intro: def.intro,
    },
    step,
    values: run.state.values,
    outputs: Object.fromEntries(
      shownIds.map((id) => [id, run.state.outputs[id]]).filter(([, o]) => o),
    ),
    shown,
    progress: { done: run.status === "done" ? def.steps.length : index, total: def.steps.length },
    canBack: run.state.history.length > 0 && run.status !== "running",
    error: run.error,
    events: await recentEvents(run.id, 0, 30),
    brand,
    ask: run.status === "running" ? run.ask : null,
    lists,
    connections:
      step?.type === "page" && step.fields.some((f) => f.kind === "connection")
        ? await connectionViews(def.connections ?? [], scopeOf(run))
        : [],
    keeps: Boolean(def.lists?.length || def.connections?.length),
    shareUrl: run.shareToken ? `${env.appUrl}/s/${run.shareToken}` : null,
    expiresAt: run.expiresAt?.toISOString() ?? null,
  };
}
