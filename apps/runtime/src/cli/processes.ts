import { execFileSync } from "node:child_process";
import { existsSync, readlinkSync } from "node:fs";
import { sep } from "node:path";

/**
 * The processes of engenty wizards on this machine, found by their command line: the runtime,
 * `wizards start` (a terminal, the login item, an older `start --no-open` whose note in the data
 * folder another one overwrote), `wizards mcp` (started by an AI app) and the copies npx runs.
 * `stop` and `uninstall` stop them all, not only the one in running.json.
 */

export type ProcessKind = "runtime" | "start" | "mcp" | "other";

export interface WizardsProcess {
  pid: number;
  kind: ProcessKind;
  command: string;
}

export interface ProcessEntry {
  pid: number;
  ppid: number;
  command: string;
}

/** Every process of this user, as `ps` lists it; empty where there is no `ps` (Windows). */
export function listProcesses(): ProcessEntry[] {
  if (process.platform === "win32") {
    return [];
  }
  try {
    const out = execFileSync("ps", ["-axww", "-o", "pid=,ppid=,command="], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    return out
      .split("\n")
      .map((line) => line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/))
      .filter((match) => match !== null)
      .map((match) => ({ pid: Number(match[1]), ppid: Number(match[2]), command: match[3] }));
  } catch {
    return [];
  }
}

/** This process and the ones that started it (npx, npm, a shell): never stopped by it. */
export function selfAndAncestors(list: ProcessEntry[], pid = process.pid): Set<number> {
  const parents = new Map(list.map((entry) => [entry.pid, entry.ppid]));
  const out = new Set<number>();
  for (let at: number | undefined = pid; at && !out.has(at); at = parents.get(at)) {
    out.add(at);
  }
  return out;
}

/** What a command line of engenty wizards runs, by its arguments. */
function kindOf(command: string): ProcessKind {
  if (/apps[\\/]runtime[\\/]dist[\\/]index\.js/.test(command)) {
    return "runtime";
  }
  const args = command.split(/\s+/);
  if (args.includes("mcp")) {
    return "mcp";
  }
  if (args.includes("start")) {
    return "start";
  }
  return "other";
}

/** The folder a process works in; null where it can't be told. */
export function cwdOf(pid: number): string | null {
  try {
    if (process.platform === "linux") {
      return readlinkSync(`/proc/${pid}/cwd`);
    }
    if (process.platform === "darwin") {
      const out = execFileSync(
        existsSync("/usr/sbin/lsof") ? "/usr/sbin/lsof" : "lsof",
        ["-a", "-p", String(pid), "-d", "cwd", "-Fn"],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        },
      );
      return (
        out
          .split("\n")
          .find((line) => line.startsWith("n"))
          ?.slice(1) || null
      );
    }
  } catch {
    // gone, or not ours to look at
  }
  return null;
}

/**
 * The processes of engenty wizards in `list`: whatever runs from the install folder `home`, and
 * the npm package `wizards` (npx, a global install) working in that folder, as the command and
 * the runtime always do (install-env.ts, start.ts). Another install's processes, and the npx
 * that only hands over to the install, are left alone; the latter ends with what it started. A
 * checkout (`pnpm wizards`) is left alone too. `skip` holds the processes never to name: this
 * one and its parents.
 */
export function wizardsProcesses(
  home: string,
  list: ProcessEntry[],
  skip: Set<number> = new Set(),
  cwd: (pid: number) => string | null = cwdOf,
): WizardsProcess[] {
  const inHome = home.endsWith(sep) ? home : home + sep;
  const fromNpm = /[\\/]node_modules[\\/](wizards[\\/]|\.bin[\\/]wizards(\s|$))/;
  const worksInHome = (pid: number) => {
    const dir = cwd(pid);
    return dir !== null && (dir === home || dir.startsWith(inHome));
  };
  return list
    .filter((entry) => !skip.has(entry.pid))
    .filter(
      (entry) =>
        entry.command.includes(inHome) || (fromNpm.test(entry.command) && worksInHome(entry.pid)),
    )
    .map((entry) => ({ pid: entry.pid, kind: kindOf(entry.command), command: entry.command }));
}

/** The processes of this install that run now, apart from this one and its parents. */
export function findWizardsProcesses(home: string): WizardsProcess[] {
  const list = listProcesses();
  return wizardsProcesses(home, list, selfAndAncestors(list));
}

export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: it runs, as somebody else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export interface StopDeps {
  kill: (pid: number, signal: NodeJS.Signals) => void;
  alive: (pid: number) => boolean;
  wait: (ms: number) => Promise<void>;
}

const realStop: StopDeps = {
  kill: (pid, signal) => process.kill(pid, signal),
  alive,
  wait: (ms) => new Promise((done) => setTimeout(done, ms)),
};

/**
 * Stops these processes: SIGTERM, then SIGKILL for any still there after `graceMs`. The ones
 * that still run after that, or could not be signalled.
 */
export async function stopProcesses(
  pids: number[],
  graceMs = 8000,
  deps: StopDeps = realStop,
): Promise<number[]> {
  const signal = (pid: number, name: NodeJS.Signals) => {
    try {
      deps.kill(pid, name);
    } catch {
      // gone already, or not ours to stop: the check below tells
    }
  };
  for (const pid of pids) {
    signal(pid, "SIGTERM");
  }
  const left = () => pids.filter((pid) => deps.alive(pid));
  for (let waited = 0; waited < graceMs && left().length; waited += 100) {
    await deps.wait(100);
  }
  for (const pid of left()) {
    signal(pid, "SIGKILL");
  }
  for (let waited = 0; waited < 2000 && left().length; waited += 100) {
    await deps.wait(100);
  }
  return left();
}
