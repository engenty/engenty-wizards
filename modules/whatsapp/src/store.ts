import { randomBytes } from "node:crypto";
import type { PluginDb } from "@engenty-wizards/plugin-sdk";
import { eq } from "drizzle-orm";
import type { Thread, ThreadState } from "./door";
import type { Account } from "./graph";
import { account, binding, thread } from "./schema";

/** The plugin's rows: the number, the keywords, the threads. */

export async function getAccount(db: PluginDb): Promise<Account | null> {
  const [row] = await db.select().from(account).where(eq(account.id, 1));
  return row
    ? {
        phoneNumberId: row.phoneNumberId,
        number: row.number,
        accessToken: row.accessToken,
        appSecret: row.appSecret,
        verifyToken: row.verifyToken,
        template: row.template,
      }
    : null;
}

export interface AccountInput {
  phoneNumberId: string;
  number: string;
  /** Left out: the token stays as it is. */
  accessToken?: string;
  appSecret?: string | null;
  template?: string | null;
}

export async function putAccount(db: PluginDb, input: AccountInput): Promise<Account> {
  const before = await getAccount(db);
  const accessToken = input.accessToken || before?.accessToken;
  if (!accessToken) {
    throw Object.assign(new Error("An access token is needed."), { status: 400, code: "no_token" });
  }
  const next = {
    phoneNumberId: input.phoneNumberId,
    number: input.number.replace(/\D/g, ""),
    accessToken,
    appSecret:
      input.appSecret === undefined ? (before?.appSecret ?? null) : input.appSecret || null,
    verifyToken: before?.verifyToken ?? randomBytes(18).toString("base64url"),
    template: input.template === undefined ? (before?.template ?? null) : input.template || null,
    updatedAt: new Date(),
  };
  await db
    .insert(account)
    .values({ id: 1, ...next })
    .onConflictDoUpdate({ target: account.id, set: next });
  return { ...next };
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

export const waLink = (number: string, keyword: string) =>
  `https://wa.me/${number}?text=${encodeURIComponent(keyword)}`;

// ── Threads ─────────────────────────────────────────────────────────────────

function rowToThread(row: typeof thread.$inferSelect): Thread {
  return {
    waId: row.waId,
    name: row.name,
    runId: row.runId,
    state: JSON.parse(row.state) as ThreadState,
    lastInboundAt: row.lastInboundAt.getTime(),
    lastMessageId: row.lastMessageId,
  };
}

export async function loadThread(db: PluginDb, waId: string): Promise<Thread | null> {
  const [row] = await db.select().from(thread).where(eq(thread.waId, waId));
  return row ? rowToThread(row) : null;
}

export async function threadByRun(db: PluginDb, runId: string): Promise<Thread | null> {
  const [row] = await db.select().from(thread).where(eq(thread.runId, runId));
  return row ? rowToThread(row) : null;
}

export async function saveThread(db: PluginDb, t: Thread): Promise<void> {
  const next = {
    name: t.name,
    runId: t.runId,
    state: JSON.stringify(t.state),
    lastInboundAt: new Date(t.lastInboundAt),
    lastMessageId: t.lastMessageId,
    updatedAt: new Date(),
  };
  await db
    .insert(thread)
    .values({ waId: t.waId, ...next })
    .onConflictDoUpdate({ target: thread.waId, set: next });
}
