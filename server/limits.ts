import { createHash } from "node:crypto";
import { and, count, eq, gte } from "drizzle-orm";
import { canSpend } from "./credits.js";
import { db, schema } from "./db/client.js";
import { env } from "./env.js";

export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) {
    return null;
  }
  return createHash("sha256").update(`${env.authSecret}:${ip}`).digest("hex").slice(0, 32);
}

function startOfDay(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export type WizardRow = typeof schema.wizard.$inferSelect;

/** Why a shared wizard cannot start a run right now, or null when it can. */
export async function wizardUnavailable(w: WizardRow): Promise<string | null> {
  if (!w.shareEnabled || w.publishedVersion === null) {
    return "Dieser Wizard ist gerade nicht verfügbar.";
  }
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.run)
    .where(
      and(
        eq(schema.run.wizardId, w.id),
        eq(schema.run.mode, "live"),
        gte(schema.run.createdAt, startOfDay()),
      ),
    );
  if (n >= w.dailyRunLimit) {
    return "Für heute ist das Limit dieses Wizards erreicht. Bitte morgen wieder versuchen.";
  }
  if (!(await canSpend())) {
    return "Dieser Wizard ist gerade nicht verfügbar.";
  }
  return null;
}

export async function verifyTurnstile(
  token: string | undefined,
  ip: string | null,
): Promise<boolean> {
  if (!env.turnstile.secret) {
    return true;
  }
  if (!token) {
    return false;
  }
  const body = new URLSearchParams({ secret: env.turnstile.secret, response: token });
  if (ip) {
    body.set("remoteip", ip);
  }
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as { success?: boolean };
    return Boolean(data.success);
  } catch {
    return false;
  }
}
