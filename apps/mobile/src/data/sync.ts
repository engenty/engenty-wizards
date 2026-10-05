import type { RunView } from "@engenty-wizards/shared/run";
import { getRunById, openRuns, type Run, updateRun } from "./db";
import { keepResult } from "./results";
import { getRun, RuntimeError } from "./runtime";

const busy = new Set<string>();

/** Brings one run up to date with the server; a finished run keeps its result on the phone. */
export async function syncRun(run: Run, known?: RunView): Promise<Run | null> {
  if (busy.has(run.id)) {
    return run;
  }
  busy.add(run.id);
  try {
    const view = known ?? (await getRun(run.runtime, run.id));
    if (view.status === "done") {
      if (!run.result) {
        await keepResult(run, view);
      }
    } else {
      await updateRun(run.id, {
        status: view.status,
        stepTitle: view.step?.title ?? null,
        progress: view.progress,
        expiresAt: view.expiresAt,
        ...(view.status === "failed" || view.status === "cancelled"
          ? { finishedAt: new Date().toISOString() }
          : {}),
      });
    }
    return getRunById(run.id);
  } catch (err) {
    // The server deleted the run (its days are over) or never had it for this visitor.
    if (err instanceof RuntimeError && err.status === 404) {
      await updateRun(run.id, { status: "cancelled", finishedAt: new Date().toISOString() });
    }
    return null;
  } finally {
    busy.delete(run.id);
  }
}

/** Every run not finished yet: when the app comes to the front and on the Wizards screen. */
export async function syncOpenRuns() {
  const runs = await openRuns();
  await Promise.all(runs.map((run) => syncRun(run)));
}
