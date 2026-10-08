import type { PluginDb } from "@engenty-wizards/plugin-sdk";
import type { Thread, ThreadState } from "@engenty-wizards/plugin-sdk/thread";
import { eq } from "drizzle-orm";
import { account, binding, thread } from "./schema";
import { type Account, e164 } from "./twilio";

/** The plugin's rows: the account, the keywords, the threads. */

export async function getAccount(db: PluginDb): Promise<Account | null> {
  const [row] = await db.select().from(account).where(eq(account.id, 1));
  return row ? { accountSid: row.accountSid, authToken: row.authToken, number: row.number } : null;
}

export interface AccountInput {
  accountSid: string;
  number: string;
  /** Left out: the token stays as it is. */
  authToken?: string;
}

export async function putAccount(db: PluginDb, input: AccountInput): Promise<Account> {
  const before = await getAccount(db);
  const authToken = input.authToken || before?.authToken;
  if (!authToken) {
    throw Object.assign(new Error("An auth token is needed."), { status: 400, code: "no_token" });
  }
  const next = {
    accountSid: input.accountSid,
    authToken,
    number: e164(input.number),
    updatedAt: new Date(),
  };
  await db
    .insert(account)
    .values({ id: 1, ...next })
    .onConflictDoUpdate({ target: account.id, set: next });
  return { accountSid: next.accountSid, authToken, number: next.number };
}

export async function dropAccount(db: PluginDb): Promise<void> {
  await db.delete(account).where(eq(account.id, 1));
}

// ── Keywords ────────────────────────────────────────────────────────────────

export const KEYWORD = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,38}$/u;

/** The keyword of every bound wizard, by wizard id. */
export async function keywords(db: PluginDb): Promise<Map<string, string>> {
  const rows = await db.select().from(binding);
  return new Map(rows.map((r) => [r.wizardId, r.keyword]));
}

/** The wizard's keyword, made from its title the first time it is asked for. */
export async function keywordOf(db: PluginDb, wizardId: string, title: string): Promise<string> {
  const all = await keywords(db);
  const own = all.get(wizardId);
  if (own) {
    return own;
  }
  const taken = new Set([...all.values()].map((k) => k.toLowerCase()));
  const base =
    title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .split(" ")[0]
      ?.slice(0, 30) || "wizard";
  let keyword = base;
  for (let n = 2; taken.has(keyword); n++) {
    keyword = `${base}${n}`;
  }
  await db.insert(binding).values({ wizardId, keyword }).onConflictDoNothing();
  return (await keywords(db)).get(wizardId) ?? keyword;
}

export async function setKeyword(db: PluginDb, wizardId: string, keyword: string): Promise<string> {
  const clean = keyword.trim().replace(/\s+/g, " ");
  if (!KEYWORD.test(clean)) {
    throw Object.assign(new Error("A keyword is letters, digits, spaces and dashes, up to 40."), {
      status: 400,
      code: "bad_keyword",
    });
  }
  const other = [...(await keywords(db))].find(
    ([id, k]) => id !== wizardId && k.toLowerCase() === clean.toLowerCase(),
  );
  if (other) {
    throw Object.assign(new Error("Another wizard has this keyword."), {
      status: 409,
      code: "keyword_taken",
    });
  }
  await db
    .insert(binding)
    .values({ wizardId, keyword: clean })
    .onConflictDoUpdate({ target: binding.wizardId, set: { keyword: clean } });
  return clean;
}

/** The link that opens the phone's messages with the keyword typed (RFC 5724). */
export const smsLink = (number: string, keyword: string) =>
  `sms:${number}?body=${encodeURIComponent(keyword)}`;

// ── Threads ─────────────────────────────────────────────────────────────────

function rowToThread(row: typeof thread.$inferSelect): Thread {
  return {
    id: row.number,
    name: null,
    runId: row.runId,
    state: JSON.parse(row.state) as ThreadState,
    lastInboundAt: row.lastInboundAt.getTime(),
    lastMessageId: row.lastMessageId,
  };
}

export async function loadThread(db: PluginDb, number: string): Promise<Thread | null> {
  const [row] = await db.select().from(thread).where(eq(thread.number, number));
  return row ? rowToThread(row) : null;
}

export async function threadByRun(db: PluginDb, runId: string): Promise<Thread | null> {
  const [row] = await db.select().from(thread).where(eq(thread.runId, runId));
  return row ? rowToThread(row) : null;
}

export async function saveThread(db: PluginDb, t: Thread): Promise<void> {
  const next = {
    runId: t.runId,
    state: JSON.stringify(t.state),
    lastInboundAt: new Date(t.lastInboundAt),
    lastMessageId: t.lastMessageId,
    updatedAt: new Date(),
  };
  await db
    .insert(thread)
    .values({ number: t.id, ...next })
    .onConflictDoUpdate({ target: thread.number, set: next });
}
