import { and, count, desc, eq, inArray } from "drizzle-orm";
import { formatsFor, type Step } from "../../shared/definition.js";
import { MICROS_PER_CREDIT } from "../billing/credits.js";
import { db, schema } from "../db/client.js";
import { emitEvent, recentEvents, subscribe } from "../engine/events.js";
import { createRun, RunInputError, reviewStep, submitPage } from "../engine/runner.js";
import { signedUrl } from "../signing.js";
import { requireCredits } from "./credits.js";
import { notFound } from "./errors.js";
import { ownedWizard, requireClean, studioUrl } from "./wizards.js";

type RunRow = typeof schema.run.$inferSelect;

/** Test runs an MCP client started with answers: pages are filled and reviews accepted for it. */
const autopilots = new Set<string>();

export async function startTestRun(
  userId: string,
  wizardId: string,
  autopilot?: { answers: Record<string, unknown>; acceptReviews: boolean },
) {
  const w = await ownedWizard(userId, wizardId);
  const { definition, files } = await requireClean(w);
  await requireCredits(userId);
  const runId = await createRun({
    wizardId: w.id,
    ownerId: userId,
    definition,
    files,
    version: null,
    mode: "test",
    userId,
  });
  if (autopilot) {
    fly(runId, autopilot.answers, autopilot.acceptReviews);
  }
  return { runId };
}

function fly(runId: string, answers: Record<string, unknown>, acceptReviews: boolean) {
  autopilots.add(runId);
  let busy = false;
  let again = false;
  const land = () => {
    autopilots.delete(runId);
    unsubscribe();
    clearTimeout(timeout);
  };
  const step = async () => {
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    try {
      do {
        again = false;
        const run = await db.query.run.findFirst({ where: eq(schema.run.id, runId) });
        if (
          !run ||
          run.status === "done" ||
          run.status === "failed" ||
          run.status === "cancelled"
        ) {
          land();
          return;
        }
        if (run.status !== "waiting_input") {
          continue;
        }
        const current = run.definition.steps.find((s) => s.id === run.cursor);
        if (current?.type === "page") {
          const values = Object.fromEntries(
            current.fields.filter((f) => f.id in answers).map((f) => [f.id, answers[f.id]]),
          );
          await submitPage(runId, current.id, values);
        } else if (current?.type === "review" && acceptReviews) {
          await reviewStep(runId, current.id, { type: "accept" });
        } else {
          land();
          return;
        }
      } while (again);
    } catch (err) {
      const message =
        err instanceof RunInputError
          ? `Antworten fehlen oder passen nicht: ${err.errors.map((e) => `${e.field} – ${e.message}`).join("; ")}`
          : (err as Error).message;
      await emitEvent(runId, null, "error", message).catch(() => undefined);
      land();
    } finally {
      busy = false;
    }
  };
  const unsubscribe = subscribe(runId, () => {
    void step();
  });
  const timeout = setTimeout(land, 30 * 60_000);
  void step();
}

async function ownedTestRun(userId: string, runId: string): Promise<RunRow> {
  const run = await db.query.run.findFirst({
    where: and(
      eq(schema.run.id, runId),
      eq(schema.run.ownerId, userId),
      eq(schema.run.mode, "test"),
    ),
  });
  if (!run) {
    throw notFound();
  }
  return run;
}

/** Still moving: running, or waiting on a page the autopilot is about to fill. */
function moving(run: RunRow) {
  return run.status === "running" || (run.status === "waiting_input" && autopilots.has(run.id));
}

async function waitWhileMoving(userId: string, runId: string, seconds: number): Promise<RunRow> {
  const deadline = Date.now() + seconds * 1000;
  let run = await ownedTestRun(userId, runId);
  while (moving(run) && Date.now() < deadline) {
    await new Promise<void>((resolve) => {
      const unsubscribe = subscribe(runId, () => {
        unsubscribe();
        clearTimeout(timer);
        resolve();
      });
      const timer = setTimeout(() => {
        unsubscribe();
        resolve();
      }, deadline - Date.now());
    });
    run = await ownedTestRun(userId, runId);
  }
  return run;
}

function clip(text: string, max: number): string {
  return text.length > max
    ? `${text.slice(0, max)} … [${text.length - max} more characters]`
    : text;
}

function deliverableFormats(run: RunRow, step: Step) {
  const possible = formatsFor(step);
  const listed = run.definition.steps
    .flatMap((s) => (s.type === "result" ? s.deliverables : []))
    .find((d) => d.from === step.id);
  return listed ? listed.formats.filter((f) => possible.includes(f)) : [];
}

/** What a test run did so far, for a client without the studio: outputs, links, cost, errors. */
export async function testRunReport(userId: string, runId: string, waitSeconds = 0) {
  const run = await waitWhileMoving(userId, runId, waitSeconds);
  const current = run.definition.steps.find((s) => s.id === run.cursor) ?? null;
  const base = `/api/runs/${run.id}`;
  const outputs = run.definition.steps.flatMap((step) => {
    const output = run.state.outputs[step.id];
    if (!output) {
      return [];
    }
    return [
      {
        stepId: step.id,
        title: step.title,
        text: output.text ? clip(output.text, 1500) : undefined,
        json: output.json === undefined ? undefined : clip(JSON.stringify(output.json), 1500),
        assets: (output.assets ?? []).map((a) => ({
          name: a.name,
          mime: a.mime,
          url: signedUrl(`${base}/assets/${a.id}`),
        })),
        downloads: Object.fromEntries(
          deliverableFormats(run, step).map((f) => [
            f,
            signedUrl(`${base}/steps/${step.id}/download?format=${f}`),
          ]),
        ),
      },
    ];
  });
  const waitingFor =
    run.status === "waiting_input" && current?.type === "page"
      ? {
          page: current.id,
          fields: current.fields.map((f) => ({
            id: f.id,
            label: f.label,
            kind: f.kind,
            required: Boolean(f.required),
            options: f.options,
          })),
        }
      : run.status === "waiting_input" && current?.type === "review"
        ? { review: current.id, hint: "Accept or regenerate in the studio." }
        : undefined;
  return {
    runId: run.id,
    status: moving(run) ? "running" : run.status,
    step: current ? { id: current.id, type: current.type, title: current.title } : null,
    waitingFor,
    error: run.error,
    credits: Math.ceil(run.costMicros / MICROS_PER_CREDIT),
    events: (await recentEvents(run.id, 0, 15)).map((e) => ({
      step: e.stepId,
      type: e.type,
      message: e.message,
    })),
    outputs,
    studioUrl: studioUrl(run.wizardId),
  };
}

export async function listRuns(userId: string, wizardId: string) {
  const w = await ownedWizard(userId, wizardId);
  const rows = await db.query.run.findMany({
    where: eq(schema.run.wizardId, w.id),
    orderBy: [desc(schema.run.createdAt)],
    limit: 100,
  });
  const assetCounts = rows.length
    ? await db
        .select({ runId: schema.asset.runId, n: count() })
        .from(schema.asset)
        .where(
          inArray(
            schema.asset.runId,
            rows.map((r) => r.id),
          ),
        )
        .groupBy(schema.asset.runId)
    : [];
  return rows.map((r) => ({
    id: r.id,
    mode: r.mode,
    status: r.status,
    version: r.version,
    createdAt: r.createdAt.toISOString(),
    credits: Math.ceil(r.costMicros / MICROS_PER_CREDIT),
    assets: assetCounts.find((a) => a.runId === r.id)?.n ?? 0,
    stepTitle: r.definition.steps.find((s) => s.id === r.cursor)?.title ?? null,
  }));
}
