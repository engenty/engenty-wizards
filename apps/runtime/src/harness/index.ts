import { claude } from "./claude.js";
import { codex } from "./codex.js";
import { cursor } from "./cursor.js";
import { forgetEnv, resolveEnv } from "./env.js";
import { gemini } from "./gemini.js";
import type { Harness, HarnessAuth, HarnessId } from "./types.js";

export { HarnessModel, notInstalled, signedOut } from "./model.js";
export { HARNESS_IDS, type Harness, type HarnessAuth, type HarnessId } from "./types.js";

/**
 * The AI clients this runtime can run as a model, in the order the setup offers them. The first
 * one installed is the one the setup recommends.
 */
export const HARNESSES: readonly Harness[] = [codex, claude, gemini, cursor];

export function harness(id: string): Harness | null {
  return HARNESSES.find((h) => h.id === id) ?? null;
}

/** Whether a binding's vendor names a client: `claude/sonnet`, `codex/default`. */
export function isHarnessVendor(vendor: string): vendor is HarnessId {
  return HARNESSES.some((h) => h.id === vendor);
}

/** A client on this machine: what the setup and the settings show of it. */
export interface HarnessStatus {
  id: HarnessId;
  name: string;
  install: string;
  site: string;
  /** Null: not installed. */
  version: string | null;
  auth: HarnessAuth;
  /** The sign-in opens the client's own app, which the person ends. */
  interactiveLogin: boolean;
}

const detected = new Map<HarnessId, { at: number; value: HarnessStatus }>();

/** One client, as it is now; asked again after a minute — it may get installed or signed in meanwhile. */
export async function detectHarness(id: HarnessId, force = false): Promise<HarnessStatus | null> {
  const h = harness(id);
  if (!h) {
    return null;
  }
  const hit = detected.get(id);
  if (!force && hit && Date.now() - hit.at < 60_000) {
    return hit.value;
  }
  if (force) {
    // The person may just have signed in or set a key in their shell.
    forgetEnv(id);
  }
  let value: HarnessStatus = {
    id,
    name: h.name,
    install: h.install,
    site: h.site,
    version: null,
    auth: "none",
    interactiveLogin: h.login.interactive,
  };
  try {
    const { env, auth } = await resolveEnv(h);
    const version = await h.version(env);
    if (version) {
      value = { ...value, version, auth };
    }
  } catch {
    // not installed
  }
  detected.set(id, { at: Date.now(), value });
  return value;
}

/** Every client this runtime knows, installed or not. */
export function detectHarnesses(force = false): Promise<HarnessStatus[]> {
  return Promise.all(HARNESSES.map((h) => detectHarness(h.id, force) as Promise<HarnessStatus>));
}

/** The clients installed on this machine. */
export async function installedHarnesses(): Promise<HarnessStatus[]> {
  return (await detectHarnesses()).filter((h) => h.version !== null);
}
