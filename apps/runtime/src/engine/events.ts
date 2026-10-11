import { AsyncResource } from "node:async_hooks";
import { EventEmitter } from "node:events";
import { noteText, type RunEvent, type RunNote } from "@engenty-wizards/shared/run";
import { and, desc, eq, gt } from "drizzle-orm";
import { db, schema } from "../db/client.js";

const bus = new EventEmitter();
bus.setMaxListeners(0);

/**
 * Something changed on a run: a new event row, or a status change (event = null) — or the
 * runtime asks the device the run is watched from to think (`device`, nothing stored).
 */
export type RunSignal = { runId: string; event: RunEvent | null; device?: DeviceRequest };

/** A call for the run's device, as engine/device.ts makes it. */
export interface DeviceRequest {
  id: string;
  kind: "think";
  system: string;
  prompt: string;
  schema: unknown | null;
}

export function signalDevice(runId: string, request: DeviceRequest) {
  bus.emit(runId, { runId, event: null, device: request } satisfies RunSignal);
}

export async function emitEvent(
  runId: string,
  stepId: string | null,
  type: RunEvent["type"],
  said: string | RunNote,
  asset?: string | null,
): Promise<void> {
  const note = typeof said === "string" ? null : said;
  const message = note ? noteText(note, "de") : (said as string);
  const [row] = await db
    .insert(schema.runEvent)
    .values({
      runId,
      stepId,
      type,
      message: message.slice(0, 2000),
      note,
      assetId: asset ?? null,
    })
    .returning();
  const event: RunEvent = {
    id: row.id,
    at: row.createdAt.toISOString(),
    stepId: row.stepId,
    type: row.type,
    message: row.message,
    note: row.note ?? null,
    asset: row.assetId,
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
    note: r.note ?? null,
    asset: r.assetId,
  }));
}
