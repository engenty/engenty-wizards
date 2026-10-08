import { randomBytes } from "node:crypto";
import type { PluginDb } from "@engenty-wizards/plugin-sdk";
import { eq } from "drizzle-orm";
import { account, call } from "./schema";

/** The plugin's rows: the accounts, the calls. */

export interface Account {
  twilioSid: string;
  twilioToken: string;
  openaiProject: string;
  openaiWebhookSecret: string;
  region: "eu" | "us";
  /** The Twilio number the links are texted from; none: no texts. */
  smsFrom: string | null;
}

export async function getAccount(db: PluginDb): Promise<Account | null> {
  const [row] = await db.select().from(account).where(eq(account.id, 1));
  return row
    ? {
        twilioSid: row.twilioSid,
        twilioToken: row.twilioToken,
        openaiProject: row.openaiProject,
        openaiWebhookSecret: row.openaiWebhookSecret,
        region: row.region,
        smsFrom: row.smsFrom,
      }
    : null;
}

export interface AccountInput {
  twilioSid: string;
  /** Left out: stays as it is. */
  twilioToken?: string;
  openaiProject: string;
  /** Left out: stays as it is. */
  openaiWebhookSecret?: string;
  region: "eu" | "us";
  smsFrom?: string | null;
}

export async function putAccount(db: PluginDb, input: AccountInput): Promise<Account> {
  const before = await getAccount(db);
  const twilioToken = input.twilioToken || before?.twilioToken;
  const openaiWebhookSecret = input.openaiWebhookSecret || before?.openaiWebhookSecret;
  if (!twilioToken) {
    throw Object.assign(new Error("Twilio's auth token is needed."), {
      status: 400,
      code: "no_token",
    });
  }
  if (!openaiWebhookSecret) {
    throw Object.assign(new Error("OpenAI's webhook secret is needed."), {
      status: 400,
      code: "no_secret",
    });
  }
  const next = {
    twilioSid: input.twilioSid,
    twilioToken,
    openaiProject: input.openaiProject,
    openaiWebhookSecret,
    region: input.region,
    smsFrom: input.smsFrom || null,
    updatedAt: new Date(),
  };
  await db
    .insert(account)
    .values({ id: 1, ...next })
    .onConflictDoUpdate({ target: account.id, set: next });
  const { updatedAt: _at, ...saved } = next;
  return saved;
}

export async function dropAccount(db: PluginDb): Promise<void> {
  await db.delete(account).where(eq(account.id, 1));
}

// ── Calls ───────────────────────────────────────────────────────────────────

export type CallRow = typeof call.$inferSelect;

export async function newCall(
  db: PluginDb,
  input: {
    caller: string;
    channel: "whatsapp" | "phone";
    payload: string | null;
    twilioCallSid: string | null;
  },
): Promise<CallRow> {
  const now = new Date();
  const row: CallRow = {
    token: randomBytes(18).toString("base64url"),
    caller: input.caller,
    channel: input.channel,
    payload: input.payload,
    twilioCallSid: input.twilioCallSid,
    openaiCallId: null,
    runId: null,
    status: "ringing",
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(call).values(row);
  return row;
}

export async function callByToken(db: PluginDb, token: string): Promise<CallRow | null> {
  const [row] = await db.select().from(call).where(eq(call.token, token));
  return row ?? null;
}

export async function updateCall(
  db: PluginDb,
  token: string,
  patch: Partial<Pick<CallRow, "openaiCallId" | "runId" | "status">>,
): Promise<void> {
  await db
    .update(call)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(call.token, token));
}
