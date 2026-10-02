import type { AskAnswer, AskInput, RunAsk } from "@engenty-wizards/shared/run";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "../db/client.js";
import { signalChanged } from "./events.js";

/** How long a step waits for the person before it goes on without them. */
const ASK_TIMEOUT_MS = 15 * 60_000;

export type AskResult = AskAnswer | { type: "timeout" };

/** Runs nobody watches (an MCP client drives them): a question there would wait for no one. */
export const unattended = new Set<string>();

const waiting = new Map<string, { ask: RunAsk; settle(result: AskResult): void }>();

async function setAsk(runId: string, ask: RunAsk | null) {
  await db.update(schema.run).set({ ask, updatedAt: new Date() }).where(eq(schema.run.id, runId));
  signalChanged(runId);
}

/**
 * Puts a question to the person and waits. The run stays "running": the step is in the middle
 * of its work and goes on with the answer. One question per run at a time.
 */
export async function askPerson(
  runId: string,
  ask: AskInput & { stepId: string },
  signal: AbortSignal,
): Promise<AskResult> {
  if (waiting.has(runId)) {
    throw new Error("The wizard is already waiting for the person.");
  }
  const full = { ...ask, id: nanoid(10), at: new Date().toISOString() } as RunAsk;
  const result = new Promise<AskResult>((resolve) => {
    const finish = (r: AskResult) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve(r);
    };
    const onAbort = () => finish({ type: "skip" });
    const timer = setTimeout(() => finish({ type: "timeout" }), ASK_TIMEOUT_MS);
    signal.addEventListener("abort", onAbort, { once: true });
    waiting.set(runId, { ask: full, settle: finish });
  });
  await setAsk(runId, full);
  try {
    return await result;
  } finally {
    waiting.delete(runId);
    await setAsk(runId, null).catch(() => undefined);
  }
}

/** The question a run is waiting on, if any. */
export function pendingAsk(runId: string): RunAsk | null {
  return waiting.get(runId)?.ask ?? null;
}

export function answerAsk(runId: string, askId: string, answer: AskAnswer): boolean {
  const entry = waiting.get(runId);
  if (!entry || entry.ask.id !== askId) {
    return false;
  }
  entry.settle(answer);
  return true;
}

/** A question left in the row by a server that stopped: nobody is waiting for it any more. */
export async function clearStaleAsk(runId: string) {
  if (!waiting.has(runId)) {
    await db.update(schema.run).set({ ask: null }).where(eq(schema.run.id, runId));
  }
}
