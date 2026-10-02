import { and, count, eq, gte, inArray, or } from "drizzle-orm";
import { control, controlDb } from "../db/client.js";
import { env } from "../env.js";
import { currentTenant } from "./tenant.js";

// What the runtime looks up before it knows the tenant: public tokens and run ids.

type LinkKind = "wizard" | "result" | "logo";

/** Remembers which tenant a public token belongs to. */
export async function putLink(token: string, kind: LinkKind, ref: string) {
  await controlDb
    .insert(control.link)
    .values({ token, tenantId: currentTenant(), kind, ref })
    .onConflictDoUpdate({
      target: control.link.token,
      set: { tenantId: currentTenant(), kind, ref },
    });
}

export async function dropLinks(tokens: string[]) {
  if (tokens.length) {
    await controlDb.delete(control.link).where(inArray(control.link.token, tokens));
  }
}

export async function tenantOfLink(token: string, kind: LinkKind): Promise<string | null> {
  const row = await controlDb.query.link.findFirst({
    where: and(eq(control.link.token, token), eq(control.link.kind, kind)),
  });
  return row?.tenantId ?? null;
}

// --- runs ----------------------------------------------------------------------

const runTenants = new Map<string, string>();

export async function indexRun(input: {
  runId: string;
  visitorId?: string | null;
  ipHash?: string | null;
}) {
  const tenantId = currentTenant();
  runTenants.set(input.runId, tenantId);
  await controlDb.insert(control.runIndex).values({
    runId: input.runId,
    tenantId,
    visitorId: input.visitorId ?? null,
    ipHash: input.ipHash ?? null,
  });
}

export async function tenantOfRun(runId: string): Promise<string | null> {
  const known = runTenants.get(runId);
  if (known) {
    return known;
  }
  const row = await controlDb.query.runIndex.findFirst({
    where: eq(control.runIndex.runId, runId),
  });
  if (row) {
    runTenants.set(runId, row.tenantId);
    if (runTenants.size > 5000) {
      runTenants.delete(runTenants.keys().next().value as string);
    }
  }
  return row?.tenantId ?? null;
}

export async function dropRuns(runIds: string[]) {
  for (const id of runIds) {
    runTenants.delete(id);
  }
  for (let i = 0; i < runIds.length; i += 200) {
    await controlDb
      .delete(control.runIndex)
      .where(inArray(control.runIndex.runId, runIds.slice(i, i + 200)));
  }
}

/** Marks a run as working, so a restart finds it again. */
export async function markRunActive(runId: string, active: boolean) {
  await controlDb.update(control.runIndex).set({ active }).where(eq(control.runIndex.runId, runId));
}

/** The runs that were working when the process stopped, with their tenants. */
export async function activeRuns(): Promise<{ runId: string; tenantId: string }[]> {
  return controlDb
    .select({ runId: control.runIndex.runId, tenantId: control.runIndex.tenantId })
    .from(control.runIndex)
    .where(eq(control.runIndex.active, true));
}

/** A visitor's runs are counted across every wizard of every tenant. */
export async function visitorOverLimit(visitorId: string, ipHash: string | null): Promise<boolean> {
  const since = new Date(Date.now() - 3600_000);
  const who = ipHash
    ? or(eq(control.runIndex.visitorId, visitorId), eq(control.runIndex.ipHash, ipHash))
    : eq(control.runIndex.visitorId, visitorId);
  const [{ n }] = await controlDb
    .select({ n: count() })
    .from(control.runIndex)
    .where(and(who, gte(control.runIndex.createdAt, since)));
  return n >= env.limits.visitorRunsPerHour;
}

// --- tenants ---------------------------------------------------------------------

export async function tenantStatus(id: string): Promise<"active" | "suspended" | null> {
  const row = await controlDb.query.tenant.findFirst({ where: eq(control.tenant.id, id) });
  return row?.status ?? null;
}

export async function setTenantStatus(id: string, status: "active" | "suspended") {
  await controlDb.update(control.tenant).set({ status }).where(eq(control.tenant.id, id));
}

/** Everything the control database knows about a tenant goes with it. */
export async function forgetTenantRows(id: string) {
  await controlDb.delete(control.link).where(eq(control.link.tenantId, id));
  await controlDb.delete(control.runIndex).where(eq(control.runIndex.tenantId, id));
  await controlDb.delete(control.session).where(eq(control.session.tenantId, id));
  await controlDb.delete(control.tenant).where(eq(control.tenant.id, id));
  for (const [runId, tenantId] of runTenants) {
    if (tenantId === id) {
      runTenants.delete(runId);
    }
  }
}
