import { AsyncResource } from "node:async_hooks";
import { EventEmitter } from "node:events";
import { and, desc, eq, gt } from "drizzle-orm";
import type { RunEvent } from "../../shared/run.js";
import { db, schema } from "../db/client.js";

const bus = new EventEmitter();
bus.setMaxListeners(0);

/** Something changed on a run: a new event row, or a status change (event = null). */
export type RunSignal = { runId: string; event: RunEvent | null };

export async function emitEvent(
  runId: string,
  stepId: string | null,
  type: RunEvent["type"],
  message: string,
): Promise<void> {
  const [row] = await db
    .insert(schema.runEvent)
    .values({ runId, stepId, type, message: message.slice(0, 2000) })
    .returning();
  const event: RunEvent = {
    id: row.id,
    at: row.createdAt.toISOString(),
    stepId: row.stepId,
    type: row.type,
    message: row.message,
  };
  bus.emit(runId, { runId, event } satisfies RunSignal);
}

export function signalChanged(runId: string) {
  bus.emit(runId, { runId, event: null } satisfies RunSignal);
}

/** The listener runs in the subscriber's own context (its tenant), whoever signals. */
export function subscribe(runId: string, listener: (signal: RunSignal) => void): () => void {
  const bound = AsyncResource.bind(listener);
  bus.on(runId, bound);
  return () => bus.off(runId, bound);
}

export async function recentEvents(runId: string, afterId = 0, limit = 40): Promise<RunEvent[]> {
  const rows = await db
    .select()
    .from(schema.runEvent)
    .where(and(eq(schema.runEvent.runId, runId), gt(schema.runEvent.id, afterId)))
    .orderBy(desc(schema.runEvent.id))
    .limit(limit);
  return rows.reverse().map((r) => ({
    id: r.id,
    at: r.createdAt.toISOString(),
    stepId: r.stepId,
    type: r.type,
    message: r.message,
  }));
}
