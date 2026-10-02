import { createHash, randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import { readSetting, writeSetting } from "../settings.js";

/**
 * API keys of a runtime that runs alone: the person's own MCP client (Claude Code, Cursor,
 * Codex) and scripts sign in with them. Only the hash is kept. A runtime of a Manage-App has
 * none of its own — keys are issued and checked there.
 */
export const API_KEY_PREFIX = "wz_";

interface StoredKey {
  id: string;
  name: string;
  start: string;
  hash: string;
  createdAt: string;
  lastRequest: string | null;
}

const hashOf = (key: string) => createHash("sha256").update(key).digest("hex");

/** A key that lives only as long as this process: the studio chat's own client signs in with it. */
let internal: string | null = null;
export function internalKey(): string {
  internal ??= `${API_KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  return internal;
}
const INTERNAL_CLIENT = "Claude (Abo)";

async function all(): Promise<StoredKey[]> {
  return (await readSetting<StoredKey[]>("apiKeys")) ?? [];
}

export async function listLocalKeys() {
  return (await all()).map(({ hash: _hash, ...rest }) => rest);
}

export async function createLocalKey(name: string) {
  const key = `${API_KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  const row: StoredKey = {
    id: nanoid(12),
    name,
    start: key.slice(0, 8),
    hash: hashOf(key),
    createdAt: new Date().toISOString(),
    lastRequest: null,
  };
  await writeSetting("apiKeys", [...(await all()), row]);
  return { id: row.id, name, key };
}

export async function deleteLocalKey(id: string) {
  await writeSetting(
    "apiKeys",
    (await all()).filter((k) => k.id !== id),
  );
}

export async function verifyLocalKey(key: string): Promise<{ id: string; name: string } | null> {
  if (internal && key === internal) {
    return { id: "internal", name: INTERNAL_CLIENT };
  }
  const keys = await all();
  const found = keys.find((k) => k.hash === hashOf(key));
  if (!found) {
    return null;
  }
  // One write a minute is enough to show the key is in use.
  if (!found.lastRequest || Date.now() - Date.parse(found.lastRequest) > 60_000) {
    found.lastRequest = new Date().toISOString();
    await writeSetting("apiKeys", keys);
  }
  return { id: found.id, name: found.name };
}
