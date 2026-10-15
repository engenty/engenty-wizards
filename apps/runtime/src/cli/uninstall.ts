import { execFile, spawnSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readlinkSync, rmdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import * as p from "@clack/prompts";
import { LOGIN_LABEL, present, removeUnit, UNIT, unloadLoginItem } from "./autostart.js";
import { type App, apps as allApps } from "./connect.js";
import { type Layout, packageRoot } from "./home.js";
import {
  findWizardsProcesses,
  type ProcessKind,
  stopProcesses,
  type WizardsProcess,
} from "./processes.js";
import { settings } from "./start.js";
import { bad, badge, bold, cyan, dim, no, ok } from "./ui.js";

const run = promisify(execFile);

/**
 * `wizards uninstall`: takes engenty wizards off this computer. It works out a plan first (the AI
 * apps connected, the login item, the processes, the install folder, the command's link) and shows
 * it; the data is a question of its own, kept unless the person deliberately deletes it. Then it
 * does the plan, looks again and says what is left. It runs from npx too, when the install itself
 * no longer does: everything it needs is loaded before it deletes anything.
 */

export interface UninstallOptions {
  dryRun: boolean;
  yes: boolean;
  deleteData: boolean;
  backup: boolean;
}

/** What the uninstall works with; tests replace it, so they never touch this computer. */
export interface UninstallSystem {
  /** The person's home folder: LaunchAgents, ~/.config, ~/.local/bin are below it. */
  userHome: string;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  interactive: boolean;
  apps(paths: Layout): App[];
  processes(home: string): WizardsProcess[];
  stop(pids: number[]): Promise<number[]>;
  unloadLoginItem(): Promise<void>;
  removeUnit(file: string): Promise<void>;
  keychain: { present(): Promise<boolean>; clear(): Promise<void> };
  sizeOf(path: string): number | null;
  readData(dataDir: string): Promise<DataCounts | null>;
  /** One archive of these folders and files, each under its own name. */
  backup(parts: string[], file: string): Promise<void>;
  now(): Date;
}

/** What the data folder holds, read from its databases. */
export interface DataCounts {
  wizards: number;
  spaces: number;
  /** Wizards with no copy in the account's cloud: they exist only here. */
  onlyHere: number;
  /** Connected accounts and kept browser sessions of wizards and spaces. */
  connections: number;
}

export interface DataPlan {
  dir: string;
  bytes: number | null;
  counts: DataCounts | null;
  /** The encrypted file with API keys and the account's sign-in (not on a Mac). */
  vault: boolean;
  /** The Keychain entries `engenty-wizards` (a Mac). */
  keychain: boolean;
  /** Settings and plugins of the install that go and stay with the data. */
  extras: string[];
}

export interface Plan {
  home: string;
  apps: { id: string; name: string; where: string }[];
  loginItem: string | null;
  processes: WizardsProcess[];
  /** The install folder, when it is there, and what its program (all but the data) takes. */
  install: { path: string; programBytes: number | null } | null;
  /** What goes from the install folder whatever happens to the data. */
  program: string[];
  links: string[];
  data: DataPlan | null;
  /** A copy npm installed for itself (`npm install -g wizards`): npm takes it away. */
  npmCopy: string | null;
  /** What could not be checked. */
  problems: string[];
}

const KEYCHAIN_SERVICE = "engenty-wizards";

/** The parts of the install folder that belong with the data: kept or deleted with it. */
const WITH_DATA = [".env", ".env.local", "plugins"];

export const realSystem = (): UninstallSystem => ({
  userHome: homedir(),
  platform: process.platform,
  env: process.env,
  interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
  apps: allApps,
  processes: findWizardsProcesses,
  stop: (pids) => stopProcesses(pids),
  unloadLoginItem,
  removeUnit,
  keychain: {
    async present() {
      if (process.platform !== "darwin") {
        return false;
      }
      try {
        await run("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE], {
          timeout: 10_000,
        });
        return true;
      } catch {
        return false;
      }
    },
    async clear() {
      // One entry per key; `security` deletes one at a time.
      for (let i = 0; i < 100; i++) {
        try {
          await run("security", ["delete-generic-password", "-s", KEYCHAIN_SERVICE], {
            timeout: 10_000,
          });
        } catch {
          return;
        }
      }
    },
  },
  sizeOf: diskSize,
  readData: readDataCounts,
  backup: async (parts, file) => {
    const args = parts.flatMap((part) => ["-C", dirname(part), basename(part)]);
    await run("tar", ["-czf", file, ...args], {
      maxBuffer: 16 * 1024 * 1024,
    });
  },
  now: () => new Date(),
});

/** Bytes a folder takes on disk, as `du` counts them; null where it can't tell. */
function diskSize(path: string): number | null {
  const result = spawnSync("du", ["-sk", path], { encoding: "utf8" });
  const kb = Number(result.stdout?.split(/\s/)[0]);
  return result.status === 0 && Number.isFinite(kb) ? kb * 1024 : null;
}

/** The counts of the data folder's databases; null when they can't be read. */
export async function readDataCounts(dataDir: string): Promise<DataCounts | null> {
  const tenants = join(dataDir, "tenants");
  const files = existsSync(tenants)
    ? readdirSync(tenants).filter((name) => name.endsWith(".db"))
    : [];
  if (!files.length && !existsSync(join(dataDir, "control.db"))) {
    return { wizards: 0, spaces: 0, onlyHere: 0, connections: 0 };
  }
  let createClient: typeof import("@libsql/client").createClient;
  try {
    ({ createClient } = await import("@libsql/client"));
  } catch {
    return null;
  }
  const count = async (
    client: ReturnType<typeof createClient>,
    sql: string,
  ): Promise<Record<string, unknown>[]> => {
    try {
      return (await client.execute(sql)).rows as unknown as Record<string, unknown>[];
    } catch {
      // A table an older install doesn't have yet
      return [];
    }
  };
  const out: DataCounts = { wizards: 0, spaces: 0, onlyHere: 0, connections: 0 };
  const ids: string[] = [];
  try {
    for (const name of files) {
      const client = createClient({ url: `file:${join(tenants, name)}` });
      try {
        out.spaces += Number((await count(client, "SELECT count(*) AS n FROM project"))[0]?.n ?? 0);
        for (const row of await count(client, "SELECT id FROM wizard")) {
          ids.push(String(row.id));
        }
        for (const table of ["store_secret", "plugin_connection"]) {
          out.connections += Number(
            (await count(client, `SELECT count(*) AS n FROM ${table}`))[0]?.n ?? 0,
          );
        }
      } finally {
        client.close();
      }
    }
    const synced = new Set<string>();
    if (existsSync(join(dataDir, "control.db"))) {
      const client = createClient({ url: `file:${join(dataDir, "control.db")}` });
      try {
        for (const row of await count(
          client,
          "SELECT key, value FROM setting WHERE key LIKE 'cloud:%'",
        )) {
          try {
            if (JSON.parse(String(row.value))?.copy) {
              synced.add(String(row.key).slice("cloud:".length));
            }
          } catch {
            // not a cloud state
          }
        }
      } finally {
        client.close();
      }
    }
    out.wizards = ids.length;
    out.onlyHere = ids.filter((id) => !synced.has(id)).length;
    return out;
  } catch {
    return null;
  }
}

function loginItemPath(system: UninstallSystem): string | null {
  if (system.platform === "darwin") {
    return join(system.userHome, "Library", "LaunchAgents", `${LOGIN_LABEL}.plist`);
  }
  if (system.platform === "linux") {
    return join(
      system.env.XDG_CONFIG_HOME || join(system.userHome, ".config"),
      "systemd",
      "user",
      UNIT,
    );
  }
  return null;
}

/** The links install.sh put into ~/.local/bin, under the command's name now and its old one. */
function ourLinks(paths: Layout, system: UninstallSystem): string[] {
  const out: string[] = [];
  for (const name of ["wizards", "engenty-wizards"]) {
    const link = join(system.userHome, ".local", "bin", name);
    try {
      if (!lstatSync(link).isSymbolicLink()) {
        continue;
      }
      const target = resolve(dirname(link), readlinkSync(link));
      if (target.startsWith(paths.home + sep)) {
        out.push(link);
      }
    } catch {
      // not there
    }
  }
  return out;
}

const inside = (dir: string, path: string) => path === dir || path.startsWith(dir + sep);

/** Works out what an uninstall takes away, without changing anything. */
export async function makePlan(paths: Layout, system: UninstallSystem): Promise<Plan> {
  const problems: string[] = [];
  const connected: Plan["apps"] = [];
  for (const app of system.apps(paths)) {
    try {
      if (await app.connected()) {
        connected.push({ id: app.id, name: app.name, where: app.where });
      }
    } catch (error) {
      problems.push(`Couldn’t check ${app.name}: ${(error as Error).message}`);
    }
  }

  let loginItem: string | null = null;
  const item = loginItemPath(system);
  if (item) {
    try {
      loginItem = present(item) ? item : null;
    } catch (error) {
      problems.push((error as Error).message);
      loginItem = item;
    }
  }

  const { dataDir } = settings(paths, system.env);
  const installThere = existsSync(paths.home);
  const program: string[] = [];
  const extras: string[] = [];
  if (installThere) {
    for (const name of readdirSync(paths.home)) {
      const path = join(paths.home, name);
      if (inside(path, dataDir) || path === dataDir) {
        continue;
      }
      if (WITH_DATA.includes(name)) {
        // An empty plugins folder is no data of anybody's.
        if (name === "plugins" && isEmptyDir(path)) {
          program.push(path);
        } else {
          extras.push(path);
        }
        continue;
      }
      program.push(path);
    }
  }

  let data: DataPlan | null = null;
  if (existsSync(dataDir)) {
    data = {
      dir: dataDir,
      bytes: system.sizeOf(dataDir),
      counts: await system.readData(dataDir).catch(() => null),
      vault: existsSync(join(dataDir, "vault")),
      keychain: await system.keychain.present(),
      extras,
    };
  } else if (extras.length) {
    data = { dir: dataDir, bytes: null, counts: null, vault: false, keychain: false, extras };
  }

  const programBytes = (home: string) => {
    const all = system.sizeOf(home);
    const kept = data && inside(home, data.dir) ? (data.bytes ?? 0) : 0;
    return all === null ? null : Math.max(0, all - kept);
  };
  const fromNpm =
    /[\\/]node_modules[\\/]wizards$/.test(packageRoot) &&
    !packageRoot.includes(`${sep}_npx${sep}`) &&
    !inside(paths.home, packageRoot);

  return {
    home: paths.home,
    apps: connected,
    loginItem,
    processes: system.processes(paths.home),
    install: installThere ? { path: paths.home, programBytes: programBytes(paths.home) } : null,
    program,
    links: ourLinks(paths, system),
    data,
    npmCopy: fromNpm ? packageRoot : null,
    problems,
  };
}

function isEmptyDir(path: string): boolean {
  try {
    return readdirSync(path).length === 0;
  } catch {
    return false;
  }
}

/** Whether there is anything to take away, data aside. */
const anything = (plan: Plan) =>
  Boolean(
    plan.apps.length ||
      plan.loginItem ||
      plan.processes.length ||
      plan.program.length ||
      plan.links.length,
  );

export function size(bytes: number | null): string {
  if (bytes === null) {
    return "";
  }
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${Math.round(bytes / 1024 / 1024)} MB`;
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A path as the person writes it, against this system's home. */
const tildeIn = (system: UninstallSystem) => (path: string) =>
  path === system.userHome || path.startsWith(system.userHome + sep)
    ? `~${path.slice(system.userHome.length)}`
    : path;

const KIND_NAMES: Record<ProcessKind, [string, string]> = {
  runtime: ["studio", "studios"],
  start: ["start", "starts"],
  mcp: ["AI app connection", "AI app connections"],
  other: ["other", "others"],
};

function describeProcesses(list: WizardsProcess[]): string {
  const kinds = (["runtime", "start", "mcp", "other"] as ProcessKind[])
    .map((kind) => [kind, list.filter((p) => p.kind === kind).length] as const)
    .filter(([, n]) => n > 0)
    .map(([kind, n]) => `${n} ${KIND_NAMES[kind][n === 1 ? 0 : 1]}`);
  return `${plural(list.length, "running process", "running processes")} (${kinds.join(", ")})`;
}

/** What the data folder holds, in words: the wizards, the spaces, the saved sign-ins. */
export function describeData(data: DataPlan, system: UninstallSystem): string[] {
  const t = tildeIn(system);
  const lines: string[] = [];
  const { counts } = data;
  if (counts) {
    const only = counts.wizards
      ? counts.onlyHere === counts.wizards
        ? counts.wizards === 1
          ? ", only on this computer"
          : ", all only on this computer"
        : counts.onlyHere
          ? `, ${counts.onlyHere} only on this computer`
          : ", all also in your account’s cloud"
      : "";
    lines.push(
      `${plural(counts.wizards, "wizard")} in ${plural(counts.spaces, "space")}${only}, with their runs and files`,
    );
  } else if (existsSync(data.dir)) {
    lines.push("your wizards, their runs and files (the databases couldn’t be read)");
  }
  const secrets = [
    counts?.connections ? plural(counts.connections, "connected account") : "",
    data.vault ? "API keys and your account’s sign-in" : "",
    data.keychain
      ? `API keys and your account’s sign-in in the Keychain (${KEYCHAIN_SERVICE})`
      : "",
  ].filter(Boolean);
  if (secrets.length) {
    lines.push(`saved sign-ins: ${secrets.join(", ")}`);
  }
  for (const extra of data.extras) {
    lines.push(
      basename(extra) === "plugins" ? `your plugins (${t(extra)})` : `your settings (${t(extra)})`,
    );
  }
  return lines;
}

/** The plan as the person reads it. */
export function describePlan(plan: Plan, system: UninstallSystem): string[] {
  const t = tildeIn(system);
  const lines: string[] = [];
  if (plan.apps.length) {
    lines.push(`Disconnect ${plan.apps.map((app) => app.name).join(", ")}`);
  }
  if (plan.loginItem) {
    lines.push(`Remove the login item ${t(plan.loginItem)}`);
  }
  if (plan.processes.length) {
    lines.push(`Stop ${describeProcesses(plan.processes)}`);
  }
  if (plan.install && plan.program.length) {
    const program = plan.install.programBytes;
    lines.push(
      `Delete the program in ${t(plan.install.path)}${program ? ` (${size(program)})` : ""}`,
    );
  }
  for (const link of plan.links) {
    lines.push(`Delete the command ${t(link)}`);
  }
  return lines;
}

/** A name that is not taken yet: `engenty-wizards-data-2026-10-15.tar.gz`, then `-2`, `-3`. */
export function backupFile(system: UninstallSystem): string {
  const day = system.now().toISOString().slice(0, 10);
  for (let n = 1; ; n++) {
    const file = join(system.userHome, `engenty-wizards-data-${day}${n > 1 ? `-${n}` : ""}.tar.gz`);
    if (!existsSync(file)) {
      return file;
    }
  }
}

export interface Outcome {
  removed: string[];
  kept: string[];
  /** `key` matches what a second look finds still there: `app:<id>`, `login`, `processes`, a path. */
  failed: { what: string; fix: string; key: string }[];
}

/** Carries out the plan; `deleteData` also takes the data, after a backup when one is asked for. */
export async function carryOut(
  paths: Layout,
  plan: Plan,
  system: UninstallSystem,
  choice: { deleteData: boolean; backup: string | null },
  say: (line: string) => void = () => undefined,
): Promise<Outcome> {
  const t = tildeIn(system);
  const out: Outcome = { removed: [], kept: [], failed: [] };
  const fail = (what: string, fix: string, key: string) => out.failed.push({ what, fix, key });

  // 1. The AI apps: first, while the command they start is still there to look at.
  const byId = new Map(system.apps(paths).map((app) => [app.id, app]));
  for (const { id, name } of plan.apps) {
    const app = byId.get(id);
    const result = app
      ? await app.disconnect().catch((error: Error) => ({ ok: false, message: error.message }))
      : { ok: false, message: "unknown app" };
    if (result.ok) {
      out.removed.push(`${name}: the wizards are gone from it`);
      say(`${ok} Disconnected ${name}`);
    } else {
      fail(
        `${name} still lists the wizards: ${result.message}`,
        `npx wizards disconnect ${id}`,
        `app:${id}`,
      );
    }
  }

  // 2. The login item, so that nothing starts it again while it stops.
  if (plan.loginItem) {
    try {
      if (system.platform === "darwin") {
        await system.unloadLoginItem();
        rmSync(plan.loginItem, { force: true });
      } else {
        await system.removeUnit(plan.loginItem);
      }
      if (present(plan.loginItem)) {
        throw new Error("it is still there");
      }
      out.removed.push(`the login item ${t(plan.loginItem)}`);
      say(`${ok} Removed the login item`);
    } catch (error) {
      fail(
        `The login item ${t(plan.loginItem)}: ${(error as Error).message}`,
        system.platform === "darwin"
          ? `launchctl bootout gui/$(id -u)/${LOGIN_LABEL}; rm ${JSON.stringify(plan.loginItem)}`
          : `systemctl --user disable --now ${UNIT}; rm ${JSON.stringify(plan.loginItem)}`,
        "login",
      );
    }
  }

  // 3. Every process: an AI app's `wizards mcp` would start the studio again, so twice.
  let left: number[] = [];
  let stopped = 0;
  for (let round = 0; round < 2; round++) {
    const now = system.processes(paths.home);
    if (!now.length) {
      break;
    }
    left = await system.stop(now.map((p) => p.pid));
    stopped += now.length - left.length;
    if (left.length) {
      break;
    }
  }
  if (stopped) {
    out.removed.push(plural(stopped, "running process", "running processes"));
    say(`${ok} Stopped ${plural(stopped, "process", "processes")}`);
  }
  if (left.length) {
    fail(
      `${plural(left.length, "process", "processes")} didn’t stop (pid ${left.join(", ")})`,
      `kill -9 ${left.join(" ")}`,
      "processes",
    );
  }

  // 4. A backup, now that nothing writes to the data any more.
  let deleteData = choice.deleteData;
  if (deleteData && choice.backup && plan.data && existsSync(plan.data.dir)) {
    try {
      await system.backup(
        [plan.data.dir, ...plan.data.extras].filter((path) => existsSync(path)),
        choice.backup,
      );
      out.kept.push(`a backup of your data: ${t(choice.backup)}`);
      say(`${ok} Saved a backup: ${t(choice.backup)}`);
    } catch (error) {
      deleteData = false;
      const folder = plan.data.dir;
      fail(
        `The backup didn’t work (${(error as Error).message.split("\n")[0]}), so your data was kept`,
        ["tar", "-czf", choice.backup, "-C", dirname(folder), basename(folder)]
          .map((arg) => (/^[\w./-]+$/.test(arg) ? arg : JSON.stringify(arg)))
          .join(" "),
        plan.data.dir,
      );
    }
  }

  // 5. The program and the command.
  const remove = (path: string, label: string) => {
    try {
      rmSync(path, { recursive: true, force: true });
      if (existsSync(path)) {
        throw new Error("it is still there");
      }
      return true;
    } catch (error) {
      fail(`${label}: ${(error as Error).message}`, `rm -rf ${JSON.stringify(path)}`, path);
      return false;
    }
  };
  if (plan.program.length) {
    if (plan.program.map((path) => remove(path, `Couldn’t delete ${t(path)}`)).every(Boolean)) {
      out.removed.push(
        `the program in ${t(plan.home)}${plan.install?.programBytes ? ` (${size(plan.install.programBytes)})` : ""}`,
      );
      say(`${ok} Deleted the program`);
    }
  }
  for (const link of plan.links) {
    if (remove(link, `Couldn’t delete ${t(link)}`)) {
      out.removed.push(`the command ${t(link)}`);
      say(`${ok} Deleted the command ${t(link)}`);
    }
  }

  // 6. The data, when that was the choice.
  if (plan.data) {
    const parts = [plan.data.dir, ...plan.data.extras].filter((path) => existsSync(path));
    if (deleteData) {
      if (parts.map((path) => remove(path, `Couldn’t delete ${t(path)}`)).every(Boolean)) {
        out.removed.push(`your data in ${t(plan.data.dir)}`);
        say(`${ok} Deleted your data`);
      }
      if (plan.data.keychain) {
        await system.keychain.clear().catch(() => undefined);
        if (await system.keychain.present()) {
          fail(
            `The Keychain still has entries “${KEYCHAIN_SERVICE}”`,
            `security delete-generic-password -s ${KEYCHAIN_SERVICE}  (once per entry), or Keychain Access`,
            "keychain",
          );
        } else {
          out.removed.push(`the Keychain entries “${KEYCHAIN_SERVICE}”`);
        }
      }
    } else {
      for (const path of parts) {
        out.kept.push(t(path));
      }
      if (plan.data.keychain) {
        out.kept.push(`the Keychain entries “${KEYCHAIN_SERVICE}”`);
      }
    }
  }

  // 7. The folders around it, when nothing is left in them.
  for (const dir of [plan.home, dirname(plan.home)]) {
    if (dir === dirname(plan.home) && dir !== join(system.userHome, ".engenty")) {
      break;
    }
    if (isEmptyDir(dir)) {
      try {
        rmdirSync(dir);
      } catch {
        // something came in meanwhile
      }
    }
  }
  return out;
}

/** What is still there after the uninstall that should not be, keyed as `Outcome.failed` is. */
export async function leftOver(
  paths: Layout,
  system: UninstallSystem,
  deletedData: boolean,
): Promise<{ key: string; what: string }[]> {
  const t = tildeIn(system);
  const again = await makePlan(paths, system);
  const out: { key: string; what: string }[] = [];
  for (const app of again.apps) {
    out.push({
      key: `app:${app.id}`,
      what: `${app.name} still lists the wizards (${t(app.where)})`,
    });
  }
  if (again.loginItem) {
    out.push({ key: "login", what: `The login item ${t(again.loginItem)} is still there` });
  }
  if (again.processes.length) {
    const pids = again.processes.map((p) => p.pid);
    out.push({
      key: "processes",
      what: `${plural(pids.length, "process", "processes")} still run (pid ${pids.join(", ")})`,
    });
  }
  for (const path of [...again.program, ...again.links]) {
    out.push({ key: path, what: `${t(path)} is still there` });
  }
  if (deletedData && again.data && existsSync(again.data.dir)) {
    out.push({ key: again.data.dir, what: `${t(again.data.dir)} is still there` });
  }
  return out;
}

const cancelled = <T>(value: T | symbol): value is symbol => {
  if (p.isCancel(value)) {
    p.cancel("Nothing was changed.");
    return true;
  }
  return false;
};

/** `wizards uninstall [--dry-run] [--yes] [--delete-data] [--backup]`. */
export async function uninstall(
  paths: Layout,
  options: UninstallOptions,
  system: UninstallSystem = realSystem(),
): Promise<number> {
  const t = tildeIn(system);
  if (!options.dryRun && !options.yes && !system.interactive) {
    console.error(
      "The uninstall asks before it deletes anything, and there is no terminal to ask in.\n" +
        "To uninstall without questions (your data is kept): wizards uninstall --yes\n" +
        "To delete your data as well: wizards uninstall --yes --delete-data\n" +
        "To only see what it would do: wizards uninstall --dry-run",
    );
    return 2;
  }

  const plan = await makePlan(paths, system);
  const steps = describePlan(plan, system);
  const dataLines = plan.data ? describeData(plan.data, system) : [];
  const show = (line: string) => console.log(line);

  console.log(`\n${badge("engenty wizards")} ${bold("uninstall")}\n`);
  if (steps.length) {
    show("This takes engenty wizards off this computer:");
    for (const step of steps) {
      show(`  ${no} ${step}`);
    }
  } else {
    show(`${ok} The program isn’t installed here (${t(plan.home)}).`);
  }
  if (plan.data) {
    show("");
    show(
      `Your data in ${t(plan.data.dir)}${plan.data.bytes ? ` (${size(plan.data.bytes)})` : ""}:`,
    );
    for (const line of dataLines) {
      show(`  ${dim("·")} ${line}`);
    }
  }
  for (const problem of plan.problems) {
    show(`  ${bad} ${problem}`);
  }
  if (plan.npmCopy) {
    show("");
    show(
      dim(
        `npm installed this command for itself. To remove it too: ${cyan("npm uninstall -g wizards")}`,
      ),
    );
  }
  show("");

  if (options.dryRun) {
    if (plan.data) {
      show(
        options.yes && options.deleteData
          ? `With --yes --delete-data your data is deleted as well${options.backup ? ", after a backup" : ""}.`
          : `Your data is kept unless you choose to delete it. A reinstall picks it up again.`,
      );
    }
    show(dim("Nothing was changed (--dry-run)."));
    return 0;
  }
  if (!anything(plan) && !plan.data) {
    show(`${ok} Nothing to uninstall.`);
    return 0;
  }

  // The data: kept unless the person deliberately deletes it.
  let deleteData = false;
  let backup: string | null = null;
  if (plan.data) {
    if (options.yes) {
      deleteData = options.deleteData;
      backup = deleteData && options.backup ? backupFile(system) : null;
    } else {
      const keepOrDelete = await p.select({
        message: "What should happen to your data?",
        options: [
          {
            value: "keep",
            label: "Keep it",
            hint: `stays in ${t(plan.data.dir)}; a reinstall picks it up again`,
          },
          { value: "delete", label: "Delete it", hint: "can’t be undone" },
        ],
        initialValue: options.deleteData ? "delete" : "keep",
      });
      if (cancelled(keepOrDelete)) {
        return 130;
      }
      if (keepOrDelete === "delete") {
        if (existsSync(plan.data.dir)) {
          const wantsBackup = await p.confirm({
            message: `Save a backup of your data first? It goes to ${t(backupFile(system))}.`,
            initialValue: true,
          });
          if (cancelled(wantsBackup)) {
            return 130;
          }
          backup = wantsBackup ? backupFile(system) : null;
        }
        const onlyHere = plan.data.counts?.onlyHere ?? 0;
        if (onlyHere > 0) {
          const typed = await p.text({
            message: `${plural(onlyHere, "wizard exists", "wizards exist")} only on this computer${backup ? " and in the backup" : ""}. To delete your data, type delete.`,
            placeholder: "delete",
          });
          if (cancelled(typed)) {
            return 130;
          }
          deleteData = typed.trim().toLowerCase() === "delete";
          if (!deleteData) {
            backup = null;
            p.log.info("Your data is kept.");
          }
        } else {
          const sure = await p.confirm({
            message: `Delete your data in ${t(plan.data.dir)}? This can’t be undone.`,
            initialValue: false,
          });
          if (cancelled(sure)) {
            return 130;
          }
          deleteData = sure;
          if (!sure) {
            backup = null;
            p.log.info("Your data is kept.");
          }
        }
      }
    }
  }

  if (!anything(plan) && !deleteData) {
    show(`${ok} Nothing to uninstall. Your data stays in ${t(plan.data?.dir ?? plan.home)}.`);
    return 0;
  }
  if (!options.yes) {
    const go = await p.confirm({
      message: deleteData
        ? "Uninstall engenty wizards and delete your data now?"
        : "Uninstall engenty wizards now? Your data is kept.",
      initialValue: true,
    });
    if (cancelled(go) || !go) {
      if (!p.isCancel(go)) {
        p.cancel("Nothing was changed.");
      }
      return 130;
    }
  }

  show("");
  const outcome = await carryOut(paths, plan, system, { deleteData, backup }, show);
  const left = await leftOver(paths, system, deleteData);

  show("");
  if (outcome.removed.length) {
    show(bold("Removed"));
    for (const line of outcome.removed) {
      show(`  ${ok} ${line}`);
    }
  }
  if (outcome.kept.length) {
    show(bold("Kept"));
    for (const line of outcome.kept) {
      show(`  ${dim("·")} ${line}`);
    }
    if (plan.data && !deleteData) {
      show(
        dim(
          "  A reinstall picks your data up again: curl -fsSL https://engenty.ai/install.sh | bash",
        ),
      );
    }
  }
  // What failed, and what the second look still found that no failure explains.
  const problems = [...outcome.failed];
  for (const { key, what } of left) {
    if (!problems.some((f) => f.key === key)) {
      problems.push({ key, what, fix: "npx wizards uninstall" });
    }
  }
  if (problems.length) {
    show(bold("Not removed"));
    for (const { what, fix } of problems) {
      show(`  ${bad} ${what}`);
      show(`    ${dim("To fix:")} ${cyan(fix)}`);
    }
    show("");
    return 1;
  }
  if (plan.npmCopy) {
    show(dim(`npm’s own copy of the command stays until: ${cyan("npm uninstall -g wizards")}`));
  }
  show(`\n${ok} engenty wizards is uninstalled.\n`);
  return 0;
}

/** The options of `uninstall` from its command line; a message when something is off. */
export function parseUninstall(argv: string[]): UninstallOptions | string {
  const options: UninstallOptions = { dryRun: false, yes: false, deleteData: false, backup: false };
  for (const arg of argv) {
    if (arg === "uninstall") {
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--yes" || arg === "-y") {
      options.yes = true;
    } else if (arg === "--delete-data") {
      options.deleteData = true;
    } else if (arg === "--backup") {
      options.backup = true;
    } else {
      return `Unknown option ${arg}. The uninstall takes --dry-run, --yes, --delete-data and --backup.`;
    }
  }
  return options;
}
