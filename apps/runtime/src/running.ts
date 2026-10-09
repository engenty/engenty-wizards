import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A runtime that runs alone leaves a note in its data folder while it runs. The command line and
 * the desktop app share that folder: a second runtime on it would write the same databases, so
 * whoever starts one looks here first and opens the running one instead.
 */
export interface Running {
  pid: number;
  port: number;
  /** The origin people open. */
  url: string;
  startedAt: string;
  /** Started by the command, which starts it again when it exits with RESTART_EXIT. */
  restarts?: boolean;
}

const FILE = "running.json";

export function writeRunning(dataDir: string, running: Running) {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, FILE), `${JSON.stringify(running, null, 2)}\n`, { mode: 0o600 });
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists and belongs to somebody else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** The runtime that holds this data folder, if its process still exists. */
export function readRunning(dataDir: string): Running | null {
  try {
    const running = JSON.parse(readFileSync(join(dataDir, FILE), "utf8")) as Running;
    return Number.isInteger(running.pid) && alive(running.pid) ? running : null;
  } catch {
    return null;
  }
}

/** Takes the note away, unless another runtime wrote it meanwhile. */
export function clearRunning(dataDir: string, pid = process.pid) {
  try {
    const running = JSON.parse(readFileSync(join(dataDir, FILE), "utf8")) as Running;
    if (running.pid === pid) {
      rmSync(join(dataDir, FILE), { force: true });
    }
  } catch {
    // nothing there
  }
}
