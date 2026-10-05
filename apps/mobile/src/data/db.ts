import type { BrandView, RunStatus } from "@engenty-wizards/shared/run";
import { openDatabaseSync } from "expo-sqlite";
import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * What the app keeps on the phone: the wizards the person added, every run started in the app,
 * and the results of finished runs (their files lie in the app's folder, see results.ts).
 * Nothing of it leaves the phone.
 */
const db = openDatabaseSync("wizards.db");

db.execSync(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS wizard (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  runtime TEXT NOT NULL,
  token TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  avatar TEXT NOT NULL DEFAULT 'round',
  brand TEXT NOT NULL DEFAULT '{}',
  available INTEGER NOT NULL DEFAULT 1,
  added_at TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  UNIQUE (runtime, token)
);
CREATE TABLE IF NOT EXISTS run (
  id TEXT PRIMARY KEY,
  wizard_id INTEGER,
  runtime TEXT NOT NULL,
  token TEXT NOT NULL,
  wizard_title TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT 'round',
  status TEXT NOT NULL,
  step_title TEXT,
  progress_done INTEGER NOT NULL DEFAULT 0,
  progress_total INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT,
  result TEXT,
  share_url TEXT,
  expires_at TEXT,
  bytes INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS run_wizard ON run (wizard_id, started_at);
CREATE TABLE IF NOT EXISTS setting (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

// --- change notices: screens read again when the data changes -----------------------------

let version = 0;
const listeners = new Set<() => void>();

export function changed() {
  version += 1;
  for (const listener of listeners) {
    listener();
  }
}

function useVersion() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
  );
}

/** Reads `query` again after every change; `deps` name what else it depends on. */
export function useQuery<T>(query: () => Promise<T>, deps: unknown[] = []): T | undefined {
  const v = useVersion();
  const [value, setValue] = useState<T>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: the version and deps are the inputs
  useEffect(() => {
    let live = true;
    void query().then((next) => {
      if (live) {
        setValue(next);
      }
    });
    return () => {
      live = false;
    };
  }, [v, ...deps]);
  return value;
}

// --- wizards ------------------------------------------------------------------------------

export interface Wizard {
  id: number;
  runtime: string;
  token: string;
  title: string;
  description: string;
  avatar: string;
  brand: BrandView;
  available: boolean;
  addedAt: string;
}

interface WizardRow {
  id: number;
  runtime: string;
  token: string;
  title: string;
  description: string;
  avatar: string;
  brand: string;
  available: number;
  added_at: string;
}

const toWizard = (r: WizardRow): Wizard => ({
  id: r.id,
  runtime: r.runtime,
  token: r.token,
  title: r.title,
  description: r.description,
  avatar: r.avatar,
  brand: JSON.parse(r.brand) as BrandView,
  available: r.available === 1,
  addedAt: r.added_at,
});

export interface WizardInfo {
  title: string;
  description: string;
  avatar: string;
  brand: BrandView;
  available: boolean;
}

/** Adds a wizard, or brings what the app knows of it up to date; answers its id. */
export async function saveWizard(runtime: string, token: string, info: WizardInfo) {
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO wizard (runtime, token, title, description, avatar, brand, available, added_at, checked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (runtime, token) DO UPDATE SET
       title = excluded.title, description = excluded.description, avatar = excluded.avatar,
       brand = excluded.brand, available = excluded.available, checked_at = excluded.checked_at`,
    runtime,
    token,
    info.title,
    info.description,
    info.avatar,
    JSON.stringify(info.brand),
    info.available ? 1 : 0,
    now,
    now,
  );
  const row = await db.getFirstAsync<{ id: number }>(
    "SELECT id FROM wizard WHERE runtime = ? AND token = ?",
    runtime,
    token,
  );
  changed();
  return row?.id ?? 0;
}

export async function listWizards(): Promise<(Wizard & { lastRunAt: string | null })[]> {
  const rows = await db.getAllAsync<WizardRow & { last_run: string | null }>(
    `SELECT w.*, (SELECT MAX(started_at) FROM run WHERE wizard_id = w.id) AS last_run
     FROM wizard w ORDER BY COALESCE(last_run, w.added_at) DESC`,
  );
  return rows.map((r) => ({ ...toWizard(r), lastRunAt: r.last_run }));
}

export async function getWizardById(id: number): Promise<Wizard | null> {
  const row = await db.getFirstAsync<WizardRow>("SELECT * FROM wizard WHERE id = ?", id);
  return row ? toWizard(row) : null;
}

export async function findWizard(runtime: string, token: string): Promise<Wizard | null> {
  const row = await db.getFirstAsync<WizardRow>(
    "SELECT * FROM wizard WHERE runtime = ? AND token = ?",
    runtime,
    token,
  );
  return row ? toWizard(row) : null;
}

/** Removes the wizard from the list; its results stay. */
export async function removeWizard(id: number) {
  await db.runAsync("UPDATE run SET wizard_id = NULL WHERE wizard_id = ?", id);
  await db.runAsync("DELETE FROM wizard WHERE id = ?", id);
  changed();
}

// --- runs and results ------------------------------------------------------------------------

/** A deliverable kept on the phone: the result step's `shown`, with its files. */
export interface KeptDeliverable {
  stepId: string;
  label: string;
  formats: string[];
  /** Format → the file's name in the run's folder; formats not fetched yet are missing. */
  files: Record<string, string>;
  /** Text a deliverable shows without a file (a text or markdown step). */
  text: string | null;
  /** Pictures shown with it, kept as files. */
  assets: { id: string; name: string; mime: string; file: string | null; ai: string | null }[];
}

export interface KeptResult {
  title: string;
  message: string | null;
  deliverables: KeptDeliverable[];
}

export interface Run {
  id: string;
  wizardId: number | null;
  runtime: string;
  token: string;
  wizardTitle: string;
  avatar: string;
  status: RunStatus;
  stepTitle: string | null;
  progress: { done: number; total: number };
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  result: KeptResult | null;
  shareUrl: string | null;
  expiresAt: string | null;
  bytes: number;
}

interface RunRow {
  id: string;
  wizard_id: number | null;
  runtime: string;
  token: string;
  wizard_title: string;
  avatar: string;
  status: RunStatus;
  step_title: string | null;
  progress_done: number;
  progress_total: number;
  started_at: string;
  updated_at: string;
  finished_at: string | null;
  result: string | null;
  share_url: string | null;
  expires_at: string | null;
  bytes: number;
}

const toRun = (r: RunRow): Run => ({
  id: r.id,
  wizardId: r.wizard_id,
  runtime: r.runtime,
  token: r.token,
  wizardTitle: r.wizard_title,
  avatar: r.avatar,
  status: r.status,
  stepTitle: r.step_title,
  progress: { done: r.progress_done, total: r.progress_total },
  startedAt: r.started_at,
  updatedAt: r.updated_at,
  finishedAt: r.finished_at,
  result: r.result ? (JSON.parse(r.result) as KeptResult) : null,
  shareUrl: r.share_url,
  expiresAt: r.expires_at,
  bytes: r.bytes,
});

export const OPEN_STATUSES: RunStatus[] = ["waiting_input", "running"];

/** A run the app saw start or open; known runs keep what they had. */
export async function noteRun(input: {
  id: string;
  wizardId: number | null;
  runtime: string;
  token: string;
  wizardTitle: string;
  avatar: string;
}) {
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO run (id, wizard_id, runtime, token, wizard_title, avatar, status, started_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'waiting_input', ?, ?)
     ON CONFLICT (id) DO NOTHING`,
    input.id,
    input.wizardId,
    input.runtime,
    input.token,
    input.wizardTitle,
    input.avatar,
    now,
    now,
  );
  changed();
}

export async function updateRun(
  id: string,
  patch: {
    status?: RunStatus;
    stepTitle?: string | null;
    progress?: { done: number; total: number };
    finishedAt?: string | null;
    result?: KeptResult | null;
    shareUrl?: string | null;
    expiresAt?: string | null;
    bytes?: number;
  },
) {
  const sets: string[] = ["updated_at = ?"];
  const values: (string | number | null)[] = [new Date().toISOString()];
  const put = (column: string, value: string | number | null) => {
    sets.push(`${column} = ?`);
    values.push(value);
  };
  if (patch.status !== undefined) {
    put("status", patch.status);
  }
  if (patch.stepTitle !== undefined) {
    put("step_title", patch.stepTitle);
  }
  if (patch.progress) {
    put("progress_done", patch.progress.done);
    put("progress_total", patch.progress.total);
  }
  if (patch.finishedAt !== undefined) {
    put("finished_at", patch.finishedAt);
  }
  if (patch.result !== undefined) {
    put("result", patch.result ? JSON.stringify(patch.result) : null);
  }
  if (patch.shareUrl !== undefined) {
    put("share_url", patch.shareUrl);
  }
  if (patch.expiresAt !== undefined) {
    put("expires_at", patch.expiresAt);
  }
  if (patch.bytes !== undefined) {
    put("bytes", patch.bytes);
  }
  await db.runAsync(`UPDATE run SET ${sets.join(", ")} WHERE id = ?`, ...values, id);
  changed();
}

export async function getRunById(id: string): Promise<Run | null> {
  const row = await db.getFirstAsync<RunRow>("SELECT * FROM run WHERE id = ?", id);
  return row ? toRun(row) : null;
}

/** Runs not finished yet, newest first. */
export async function openRuns(): Promise<Run[]> {
  const rows = await db.getAllAsync<RunRow>(
    "SELECT * FROM run WHERE status IN ('waiting_input', 'running') ORDER BY updated_at DESC",
  );
  return rows.map(toRun);
}

/** Finished runs with a result, newest first; of one wizard when `wizardId` is given. */
export async function listResults(wizardId?: number): Promise<Run[]> {
  const rows =
    wizardId === undefined
      ? await db.getAllAsync<RunRow>(
          "SELECT * FROM run WHERE status = 'done' ORDER BY COALESCE(finished_at, updated_at) DESC",
        )
      : await db.getAllAsync<RunRow>(
          "SELECT * FROM run WHERE status = 'done' AND wizard_id = ? ORDER BY COALESCE(finished_at, updated_at) DESC",
          wizardId,
        );
  return rows.map(toRun);
}

/** The newest unfinished run of a wizard, to continue. */
export async function openRunOf(wizardId: number): Promise<Run | null> {
  const row = await db.getFirstAsync<RunRow>(
    "SELECT * FROM run WHERE wizard_id = ? AND status IN ('waiting_input', 'running') ORDER BY updated_at DESC",
    wizardId,
  );
  return row ? toRun(row) : null;
}

export async function deleteRun(id: string) {
  await db.runAsync("DELETE FROM run WHERE id = ?", id);
  changed();
}

export async function deleteAllResults() {
  await db.runAsync("DELETE FROM run WHERE status IN ('done', 'failed', 'cancelled')");
  changed();
}

export async function storageUsed(): Promise<number> {
  const row = await db.getFirstAsync<{ n: number | null }>("SELECT SUM(bytes) AS n FROM run");
  return row?.n ?? 0;
}

// --- settings --------------------------------------------------------------------------------

export async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM setting WHERE key = ?",
    key,
  );
  return row ? (JSON.parse(row.value) as T) : fallback;
}

export async function writeSetting(key: string, value: unknown) {
  await db.runAsync(
    "INSERT INTO setting (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    key,
    JSON.stringify(value),
  );
  changed();
}
