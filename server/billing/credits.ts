import { eq, sql } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { env } from "../env.js";

/** 1 credit = 1 cent retail. Provider cost is marked up so a plan's credits cover their price. */
export const MICROS_PER_CREDIT = 1_000_000;
const MARKUP = Number(process.env.CREDITS_MARKUP ?? 2) || 2;

export function usdToMicros(usd: number): number {
  return Math.ceil(usd * 100 * MARKUP * MICROS_PER_CREDIT);
}

export function microsToCredits(micros: number): number {
  return Math.floor(micros / MICROS_PER_CREDIT);
}

function monthlyAllowance(plan: "free" | "pro"): number {
  return (plan === "pro" ? env.credits.proMonthly : env.credits.freeMonthly) * MICROS_PER_CREDIT;
}

function nextMonth(from: Date): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + 1);
  return d;
}

export type BillingRow = typeof schema.billing.$inferSelect;

/** The user's billing row, refilled when its month has turned. */
export async function getBilling(userId: string): Promise<BillingRow> {
  let row = await db.query.billing.findFirst({ where: eq(schema.billing.userId, userId) });
  if (!row) {
    const now = new Date();
    await db
      .insert(schema.billing)
      .values({
        userId,
        plan: "free",
        allowanceMicros: monthlyAllowance("free"),
        allowanceResetAt: nextMonth(now),
      })
      .onConflictDoNothing();
    row = (await db.query.billing.findFirst({ where: eq(schema.billing.userId, userId) }))!;
  }
  if (row.allowanceResetAt && row.allowanceResetAt.getTime() < Date.now()) {
    const allowance = monthlyAllowance(row.plan);
    await db
      .update(schema.billing)
      .set({
        allowanceMicros: allowance,
        allowanceResetAt: nextMonth(new Date()),
        updatedAt: new Date(),
      })
      .where(eq(schema.billing.userId, userId));
    row = { ...row, allowanceMicros: allowance };
  }
  return row;
}

export async function balanceMicros(userId: string): Promise<number> {
  const row = await getBilling(userId);
  return Math.max(0, row.allowanceMicros) + Math.max(0, row.topupMicros);
}

/** At least one credit left — enough to start something. */
export async function canSpend(userId: string): Promise<boolean> {
  return (await balanceMicros(userId)) >= MICROS_PER_CREDIT;
}

/** Draw from the monthly allowance first, then bought credits. May overdraw by the last call. */
export async function charge(userId: string, micros: number, reason: string, runId?: string) {
  if (micros <= 0) {
    return;
  }
  const row = await getBilling(userId);
  const fromAllowance = Math.min(Math.max(0, row.allowanceMicros), micros);
  const fromTopup = micros - fromAllowance;
  await db
    .update(schema.billing)
    .set({
      allowanceMicros: sql`${schema.billing.allowanceMicros} - ${fromAllowance}`,
      topupMicros: sql`${schema.billing.topupMicros} - ${fromTopup}`,
      updatedAt: new Date(),
    })
    .where(eq(schema.billing.userId, userId));
  await db.insert(schema.creditLedger).values({ userId, deltaMicros: -micros, reason, runId });
}

export async function grantTopup(userId: string, credits: number, reason: string) {
  await getBilling(userId);
  const micros = credits * MICROS_PER_CREDIT;
  await db
    .update(schema.billing)
    .set({ topupMicros: sql`${schema.billing.topupMicros} + ${micros}`, updatedAt: new Date() })
    .where(eq(schema.billing.userId, userId));
  await db.insert(schema.creditLedger).values({ userId, deltaMicros: micros, reason });
}

export async function setPlan(
  userId: string,
  plan: "free" | "pro",
  stripe?: { customerId?: string | null; subscriptionId?: string | null },
) {
  const row = await getBilling(userId);
  const upgrade = plan === "pro" && row.plan !== "pro";
  await db
    .update(schema.billing)
    .set({
      plan,
      ...(stripe?.customerId !== undefined ? { stripeCustomerId: stripe.customerId } : {}),
      ...(stripe?.subscriptionId !== undefined
        ? { stripeSubscriptionId: stripe.subscriptionId }
        : {}),
      // An upgrade fills the new allowance at once and starts its month today.
      ...(upgrade
        ? { allowanceMicros: monthlyAllowance("pro"), allowanceResetAt: nextMonth(new Date()) }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.billing.userId, userId));
}
