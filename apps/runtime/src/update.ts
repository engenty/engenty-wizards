import { spawn } from "node:child_process";
import { mkdirSync, openSync } from "node:fs";
import { join } from "node:path";
import { installedByScript, isCheckout, layout, packageRoot, packageVersion } from "./cli/home.js";

const RELEASES_URL =
  process.env.ENGENTY_WIZARDS_RELEASES_URL?.trim() ||
  "https://api.github.com/repos/engenty/engenty-wizards/releases/latest";
const FOUND_FOR_MS = 6 * 60 * 60_000;
const MISSED_FOR_MS = 60 * 60_000;

/**
 * The exit code with which the runtime asks the command that started it for a restart: after an
 * update, that command starts the new version (cli/start.ts).
 */
export const RESTART_EXIT = 75;

/** Set by the command that starts the runtime when it starts it again on RESTART_EXIT. */
const RESTARTS = "ENGENTY_WIZARDS_RESTARTS";

/** How this copy got here: only an install made by install.sh can update itself. */
export type InstallKind = "script" | "checkout" | "npm";

export interface UpdateStatus {
  current: string;
  /** The newest release, or null when it is not known (no network, or the check is off). */
  latest: string | null;
  newer: boolean;
  kind: InstallKind;
  /** Where the release is described. */
  url: string | null;
  /** The studio can run the update itself. */
  canApply: boolean;
  /** After an update the runtime starts the new version by itself; else the person restarts it. */
  restarts: boolean;
  applying: "idle" | "running" | "done" | "failed";
}

let cached: { at: number; latest: string | null; url: string | null } | null = null;
let applying: UpdateStatus["applying"] = "idle";
let restart: ((code: number) => void) | null = null;

/** How the runtime stops cleanly; the update calls it with RESTART_EXIT once it is installed. */
export function onRestart(shutdown: (code: number) => void) {
  restart = shutdown;
}

function restarts(): boolean {
  return process.env[RESTARTS] === "1" && restart !== null;
}

/** `0.2.0` or `v0.2.0` as numbers; anything after a `-` (a pre-release) is ignored. */
function numbers(version: string): number[] {
  return version
    .replace(/^v/, "")
    .split("-")[0]
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
}

export function isNewer(latest: string, current: string): boolean {
  const a = numbers(latest);
  const b = numbers(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) {
      return diff > 0;
    }
  }
  return false;
}

async function newestRelease(): Promise<{ latest: string | null; url: string | null }> {
  if (process.env.ENGENTY_WIZARDS_NO_UPDATE_CHECK) {
    return { latest: null, url: null };
  }
  const age = cached ? Date.now() - cached.at : Number.POSITIVE_INFINITY;
  if (cached && age < (cached.latest ? FOUND_FOR_MS : MISSED_FOR_MS)) {
    return cached;
  }
  let found: { latest: string | null; url: string | null } = { latest: null, url: null };
  try {
    const response = await fetch(RELEASES_URL, {
      headers: { accept: "application/vnd.github+json", "user-agent": "engenty-wizards" },
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const release = (await response.json()) as { tag_name?: string; html_url?: string };
      if (typeof release.tag_name === "string" && /^v?\d+\.\d+/.test(release.tag_name)) {
        found = { latest: release.tag_name.replace(/^v/, ""), url: release.html_url ?? null };
      }
    }
  } catch {
    // offline: the studio says nothing
  }
  cached = { at: Date.now(), ...found };
  return found;
}

function installKind(): InstallKind {
  return installedByScript() ? "script" : isCheckout() ? "checkout" : "npm";
}

export async function updateStatus(): Promise<UpdateStatus> {
  const current = packageVersion();
  const { latest, url } = await newestRelease();
  const kind = installKind();
  return {
    current,
    latest,
    newer: latest !== null && isNewer(latest, current),
    kind,
    url,
    canApply: kind === "script",
    restarts: restarts(),
    applying,
  };
}

/**
 * Runs `wizards update` in the background, the same steps as in a terminal. Afterwards a
 * runtime started by the command restarts into the new version; any other keeps running the old
 * one until somebody restarts it. The output goes to logs/update.log.
 */
export function applyUpdate(): UpdateStatus["applying"] {
  if (applying === "running" || installKind() !== "script") {
    return applying;
  }
  const paths = layout();
  mkdirSync(paths.logs, { recursive: true });
  const log = openSync(join(paths.logs, "update.log"), "a");
  applying = "running";
  const child = spawn(process.execPath, [join(packageRoot, "bin/wizards.mjs"), "update"], {
    cwd: paths.home,
    stdio: ["ignore", log, log],
  });
  child.on("error", () => {
    applying = "failed";
  });
  child.on("exit", (code) => {
    applying = code === 0 ? "done" : "failed";
    if (applying === "done" && restarts()) {
      // A moment for the page to hear that it is done.
      setTimeout(() => restart?.(RESTART_EXIT), 1500);
    }
  });
  return applying;
}
