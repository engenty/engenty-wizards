import {
  branchValues,
  dataRef,
  type Format,
  formatsFor,
  LIST_FORMATS,
  listRef,
  nextStepId,
  optionsFromData,
  type PageStep,
  pageNeeds,
  type Step,
  type WizardDefinition,
} from "@engenty-wizards/shared/definition";
import type { ClosedChoice, RunState, RunView, ShownList } from "@engenty-wizards/shared/run";
import type { ListDef, ListRow } from "@engenty-wizards/shared/store";
import type { WorkspaceFile } from "@engenty-wizards/shared/workspace";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { connectionViews } from "../connectors/index.js";
import {
  addLocalCost,
  canSpend,
  releaseRun,
  reserveForRun,
  syncRunCost,
} from "../credits/credits.js";
import { estimateRun } from "../credits/estimate.js";
import { db, schema, withTenant } from "../db/client.js";
import { env } from "../env.js";
import { saveAsset } from "../files/storage.js";
import { managed, tenantInfo } from "../manage.js";
import { hasFfmpeg } from "../media/ffmpeg.js";
import {
  freeTierRefusal,
  freeTierText,
  ModelUnavailableError,
  noteFreeTierRefusal,
} from "../models.js";
import { runEnded } from "../plugins/events.js";
import { projectFiles } from "../services/project-files.js";
import { projectProfile } from "../services/projects.js";
import { listRows, scopeOf } from "../store/index.js";
import { activeRuns, indexRun, markRunActive } from "../tenants/control.js";
import { currentTenant } from "../tenants/tenant.js";
import { askPerson, clearStaleAsk, unattended } from "./asks.js";
import { emitEvent, recentEvents, signalChanged } from "./events.js";
import { type PageContext, readPageInput } from "./input.js";
import { pushRun } from "./push.js";
import {
  blockingMessage,
  closedChoices,
  missingModels,
  openValue,
  stepsWithoutModel,
} from "./requirements.js";
import { releaseResources, resourcesFor } from "./resources.js";
import { runAutomaticStep } from "./steps.js";
import { resolveRef } from "./template.js";
import type { ProjectRow, RunRow, StepContext } from "./types.js";
import { StepError } from "./types.js";

/** A command the run cannot take in its current state. */
export class RunConflict extends Error {}
export class RunInputError extends Error {
  constructor(readonly errors: { field: string; message: string }[]) {
    super("Bitte die markierten Felder prüfen.");
  }
}

export class NoCreditsError extends Error {
  constructor() {
    super("Dieser Wizard hat gerade kein Guthaben mehr. Bitte später erneut versuchen.");
  }
}

const active = new Map<string, AbortController>();

// --- a tenant's runs that work at the same time ---------------------------------
// Runs beyond the limit wait in line; nothing is refused.

const slots = new Map<string, { busy: number; waiting: (() => void)[] }>();

async function concurrencyLimit(tenant: string): Promise<number> {
  if (!managed) {
    return env.limits.concurrentRuns;
  }
  const info = await tenantInfo(tenant).catch(() => null);
  return info?.limits.concurrentRuns || env.limits.concurrentRuns;
}

async function acquireSlot(tenant: string, signal: AbortSignal): Promise<boolean> {
  const limit = await concurrencyLimit(tenant);
  let slot = slots.get(tenant);
  if (!slot) {
    slot = { busy: 0, waiting: [] };
    slots.set(tenant, slot);
  }
  if (slot.busy < limit) {
    slot.busy++;
    return true;
  }
  const queue = slot.waiting;
  return new Promise<boolean>((resolve) => {
    const go = () => {
      signal.removeEventListener("abort", stop);
      resolve(true);
    };
    const stop = () => {
      queue.splice(queue.indexOf(go), 1);
      resolve(false);
    };
    queue.push(go);
    signal.addEventListener("abort", stop, { once: true });
  });
}

function releaseSlot(tenant: string) {
  const slot = slots.get(tenant);
  if (!slot) {
    return;
  }
  const next = slot.waiting.shift();
  if (next) {
    // The slot passes straight to the next run in line.
    next();
  } else {
    slot.busy--;
  }
}

async function loadRun(runId: string): Promise<RunRow | undefined> {
  return db.query.run.findFirst({ where: eq(schema.run.id, runId) });
}

/** The project a run's wizard belongs to — where its imported connectors live. */
export async function projectIdOf(run: RunRow): Promise<string> {
  const w = await db.query.wizard.findFirst({ where: eq(schema.wizard.id, run.wizardId) });
  return w?.projectId ?? "";
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
  // A run that ended needs no credits held for it any more.
  if (patch.status === "done" || patch.status === "failed" || patch.status === "cancelled") {
    await releaseRun(runId);
    // Plugins hear of it; the run does not wait for them.
    void runEnded(runId, patch.status);
    if (patch.status !== "cancelled") {
      void pushRun(runId, patch.status);
    }
  }
  signalChanged(runId);
}

function stepOf(def: WizardDefinition, id: string | null): Step | undefined {
  return id ? def.steps.find((s) => s.id === id) : undefined;
}

function friendly(err: unknown): string {
  if (err instanceof StepError || err instanceof ModelUnavailableError) {
    return err.message;
  }
  // An own AI Gateway key on Vercel's free tier: the person can top it up or pick another way.
  const refused = freeTierRefusal(err);
  if (refused !== null) {
    return freeTierText(refused);
  }
  const msg = (err as Error)?.message ?? String(err);
  // The model-gateway answers 402 once the tenant's credits are used up.
  if (/insufficient_credits|\b402\b/i.test(msg)) {
    return new NoCreditsError().message;
  }
  // A runtime that runs alone pays its provider itself: its admin can top the account up.
  if (!managed && /minimum balance|insufficient_funds|top up your credits/i.test(msg)) {
    return "Das Guthaben beim Modell-Anbieter reicht dafür nicht aus (Videos brauchen dort ein Mindestguthaben). Bitte dort aufladen und noch einmal versuchen.";
  }
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
  // A step every run passes through needs a model this runtime cannot serve: refuse before anything is held.
  const blocked = blockingMessage(await missingModels(input.definition));
  if (blocked) {
    throw new ModelUnavailableError(blocked);
  }
  // The run's expected cost is held before it starts; what it really costs is booked per call.
  const estimate = await estimateRun(
    input.wizardId,
    input.version,
    input.definition,
    await stepsWithoutModel(input.definition),
  );
  if (!(await reserveForRun(id, estimate.reserve))) {
    throw new NoCreditsError();
  }
  await db.insert(schema.run).values({
    id,
    wizardId: input.wizardId,
    tenantId: currentTenant(),
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
  await indexRun({ runId: id, visitorId: input.visitorId, ipHash: input.ipHash });
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
  const tenant = currentTenant();
  const work = async () => {
    await markRunActive(runId, true);
    if (!(await acquireSlot(tenant, abort.signal))) {
      return;
    }
    try {
      await drive(runId, abort.signal);
    } finally {
      releaseSlot(tenant);
    }
  };
  work()
    .catch(async (err) => {
      console.error(`[run ${runId}]`, err);
      await updateRun(runId, { status: "failed", error: friendly(err) }).catch(() => undefined);
    })
    .finally(async () => {
      active.delete(runId);
      await markRunActive(runId, false).catch(() => undefined);
      await releaseResources(runId);
      signalChanged(runId);
    });
}

/** What conditions read in this run: answers, outputs, and how many rows each stored list has. */
async function flowValues(run: RunRow, state: RunState): Promise<Record<string, unknown>> {
  const counts: Record<string, number> = {};
  if (run.definition.lists?.length) {
    for (const [id, list] of Object.entries(await storedLists(run))) {
      counts[id] = list.rows.length;
    }
  }
  return branchValues(state.values, state.outputs, counts);
}

/**
 * What a page knows besides the person's input: what its fields' `when` read from before the
 * page (its own earlier answers left out, so a revisit decides on what is typed now) and the
 * choices its `optionsFrom` fields find in the run.
 */
async function pageContext(run: RunRow, step: PageStep): Promise<Required<PageContext>> {
  const needs = pageNeeds(step.fields);
  const sourced = step.fields.filter((f) => f.optionsFrom);
  if (!needs.length && !sourced.length) {
    return { known: {}, options: {} };
  }
  const all = await flowValues(run, run.state);
  const known = Object.fromEntries(needs.map((ref) => [ref, all[ref]]));
  const lists = sourced.some((f) => f.optionsFrom?.startsWith("lists."))
    ? await storedLists(run)
    : {};
  const options: Record<string, string[]> = {};
  for (const field of sourced) {
    const found = optionsFromData(field.optionsFrom ?? "", run.state.outputs, lists);
    if (found.length) {
      options[field.id] = found;
    }
  }
  return { known, options };
}

/** The wizard's lists with the person's rows, by list id. */
async function storedLists(
  run: RunRow,
): Promise<Record<string, { def: ListDef; rows: ListRow[] }>> {
  const scope = scopeOf(run);
  const out: Record<string, { def: ListDef; rows: ListRow[] }> = {};
  for (const def of run.definition.lists ?? []) {
    out[def.id] = { def, rows: await listRows(scope, def) };
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
    tenantId: run.tenantId,
    stepId,
    store,
    def: run.definition,
    files: run.files,
    state,
    scope: {
      def: run.definition,
      state,
      brand: projectProfile(project),
      lists: await storedLists(run),
    },
    project,
    projectFiles: (await projectFiles(project.id)).filter((f) => f.status === "ready"),
    signal,
    resources,
    ask: (ask) =>
      unattended.has(run.id)
        ? Promise.resolve(null)
        : askPerson(run.id, { ...ask, stepId }, signal),
    emit: (type, message, asset) => emitEvent(run.id, run.cursor, type, message, asset),
    call: { runId: run.id, stepId },
    chargeUsd: (usd) => addLocalCost(run.id, stepId, usd),
    saveAsset: (input) =>
      saveAsset({
        ...input,
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
      // A step that ran is over and the next one is the person's: a phone in a pocket hears it.
      void pushRun(runId, "waiting");
      return;
    }
    if (!(await canSpend())) {
      const message = new NoCreditsError().message;
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
      await syncRunCost(runId);
      state.outputs[step.id] = output;
      delete state.notes[step.id];
      delete state.redo?.[step.id];
      const cursor = nextStepId(def, step.id, await flowValues(run, state));
      await updateRun(runId, { state, cursor, status: cursor ? "running" : "done", error: null });
      await emitEvent(runId, step.id, "step_done", step.title);
    } catch (err) {
      if (signal.aborted) {
        return;
      }
      console.error(`[run ${runId} step ${step.id}]`, err);
      await noteFreeTierRefusal(err);
      const message = friendly(err);
      await emitEvent(runId, step.id, "error", message);
      await updateRun(runId, { status: "failed", error: message });
      return;
    }
  }
}

/** Runs a restart left mid-step go on where they were. */
export async function resumeInterruptedRuns() {
  for (const r of await activeRuns()) {
    await withTenant(r.tenantId, async () => {
      const run = await loadRun(r.runId);
      if (run?.status === "running") {
        kick(r.runId);
      } else {
        await markRunActive(r.runId, false);
      }
    }).catch((err) => console.error(`[resume ${r.runId}]`, err));
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
  const { values, errors } = readPageInput(step, input, await pageContext(run, step));
  // An answer that leads to a step without a model here would stop the run there, later.
  const closed = await closedChoices(run.definition, step, run.state.values);
  for (const [id, choice] of Object.entries(closed)) {
    const answer = values[id];
    if (
      answer !== undefined &&
      (choice.values.length === 0 || choice.values.some((v) => String(v) === String(answer)))
    ) {
      errors.push({ field: id, message: "Das ist hier gerade nicht verfügbar." });
    }
  }
  if (errors.length) {
    throw new RunInputError(errors);
  }
  const connections = step.fields.some((f) => f.kind === "connection")
    ? await connectionViews(run.definition.connections ?? [], scopeOf(run), await projectIdOf(run))
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
  const cursor = nextStepId(run.definition, stepId, await flowValues(run, state));
  await updateRun(runId, { state, cursor, status: "running", error: null });
  kick(runId);
}

export type ReviewAction =
  | { type: "accept"; edits?: Record<string, string> }
  | { type: "regenerate"; target: string; note: string; items?: number[] };

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
    const cursor = nextStepId(run.definition, stepId, await flowValues(run, state));
    await updateRun(runId, { state, cursor, status: "running", error: null });
    kick(runId);
    return;
  }
  if (!step.show.includes(action.target)) {
    throw new RunConflict("Unknown target");
  }
  state.notes[action.target] = action.note.slice(0, 2000) || "Bitte eine neue Variante.";
  // A step with several results makes only the named ones again.
  if (action.items?.length) {
    state.redo = { ...state.redo, [action.target]: action.items };
  } else {
    delete state.redo?.[action.target];
  }
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
  const output = run.state.outputs[step.id];
  if (step.type === "widget" && formats.includes("mp4")) {
    // A film is rendered when its step runs; any other widget on demand.
    const has = step.video
      ? output?.assets?.some((a) => a.kind === "video")
      : output?.widget?.duration && (await hasFfmpeg());
    if (!has) {
      formats = formats.filter((f) => f !== "mp4");
    }
  }
  // A zip holds the files a step collected, or its several results; with one there is nothing to zip.
  if (formats.includes("zip")) {
    const has =
      step.type === "generate"
        ? (output?.assets?.length ?? 0) > 1
        : output?.assets?.some((a) => a.kind === "file");
    if (!has) {
      formats = formats.filter((f) => f !== "zip");
    }
  }
  return formats;
}

/**
 * What the page's fields start with: an earlier step's result where they name one, and for a
 * choice whose default leads to a step without a model here, the first value that does not.
 */
function prefillOf(
  step: PageStep,
  run: RunRow,
  closed: Record<string, ClosedChoice>,
): Record<string, unknown> {
  const scope = { def: run.definition, state: run.state, brand: {} };
  const out: Record<string, unknown> = {};
  for (const field of step.fields) {
    if (!field.prefill) {
      continue;
    }
    const value = resolveRef(dataRef(field.prefill), scope);
    if (value !== undefined && value !== null && value !== "") {
      out[field.id] = value;
    }
  }
  for (const [id, choice] of Object.entries(closed)) {
    const field = step.fields.find((f) => f.id === id);
    const start = out[id] ?? field?.default ?? (field?.kind === "toggle" ? false : undefined);
    if (field && start !== undefined && choice.values.some((v) => String(v) === String(start))) {
      out[id] = openValue(step, id, choice);
    }
  }
  return out;
}

export async function runView(run: RunRow, brand: RunView["brand"]): Promise<RunView> {
  const def = run.definition;
  const step = stepOf(def, run.cursor) ?? null;
  const closed =
    step?.type === "page" && run.status === "waiting_input"
      ? await closedChoices(def, step, run.state.values)
      : {};
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
        formats: deliverable
          ? deliverable.formats.filter(
              (f) => LIST_FORMATS.includes(f) && (f !== "zip" || stored[id].def.check?.file),
            )
          : [],
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
    prefill: step?.type === "page" ? prefillOf(step, run, closed) : {},
    ...(step?.type === "page" ? await pageContext(run, step) : {}),
    closed,
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
        ? await connectionViews(def.connections ?? [], scopeOf(run), await projectIdOf(run))
        : [],
    keeps: Boolean(def.lists?.length || def.connections?.length),
    shareUrl: run.shareToken ? `${env.appUrl}/s/${run.shareToken}` : null,
    expiresAt: run.expiresAt?.toISOString() ?? null,
  };
}
