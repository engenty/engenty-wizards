import { type ChildProcess, type SpawnOptions, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { styleText } from "node:util";
import { mintLocalTicket } from "../auth/local-ticket.js";
import { type Running, readRunning } from "../running.js";
import { RESTART_EXIT } from "../update.js";
import { runtimeEnv } from "./environment.js";
import { type Layout, packageRoot, readEnvFile } from "./home.js";
import { findOnPath } from "./machine.js";

const DEFAULT_PORT = 24368;
const START_TIMEOUT_MS = 60_000;

/** The settings this install starts with: its `.env`, overridden by the terminal's variables. */
export function settings(paths: Layout, env: NodeJS.ProcessEnv = process.env) {
  const fileEnv = readEnvFile(paths.envFile);
  const value = (key: string) => env[key]?.trim() || fileEnv[key]?.trim() || "";
  return {
    fileEnv,
    dataDir: value("DATA_DIR") ? resolve(paths.home, value("DATA_DIR")) : paths.data,
    port: Number(value("API_PORT")) || null,
    appUrl: value("APP_URL").replace(/\/$/, ""),
  };
}

export async function healthy(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function portIsFree(port: number): Promise<boolean> {
  return new Promise((done) => {
    const probe = createServer();
    probe.once("error", () => done(false));
    probe.listen(port, "127.0.0.1", () => probe.close(() => done(true)));
  });
}

/** The usual port, or the next free one after it. */
async function freePort(): Promise<number> {
  for (let port = DEFAULT_PORT; port < DEFAULT_PORT + 20; port++) {
    if (await portIsFree(port)) {
      return port;
    }
  }
  throw new Error(`No free port between ${DEFAULT_PORT} and ${DEFAULT_PORT + 19}.`);
}

/** The runtime that already runs on this install's data folder and answers. */
export async function runningRuntime(dataDir: string): Promise<Running | null> {
  const running = readRunning(dataDir);
  return running && (await healthy(running.port)) ? running : null;
}

/** A link that lets this browser into a running runtime: a ticket signed with the data folder's secret. */
export function entryUrl(running: Pick<Running, "url">, dataDir: string): string {
  try {
    const secret = readFileSync(join(dataDir, "secret"), "utf8").trim();
    return `${running.url}/api/local/enter?t=${mintLocalTicket(secret)}`;
  } catch {
    // APP_SECRET is set elsewhere: the browser gets in if it was let in before.
    return `${running.url}/`;
  }
}

/** Opens an address in the person's browser; false when this machine has none to open it with. */
export function openBrowser(url: string): boolean {
  const opener =
    process.platform === "darwin"
      ? "open"
      : process.env.DISPLAY || process.env.WAYLAND_DISPLAY
        ? "xdg-open"
        : null;
  if (!opener || !findOnPath(opener, process.env.PATH ?? "")) {
    return false;
  }
  try {
    spawn(opener, [url], { stdio: "ignore", detached: true }).unref();
    return true;
  } catch {
    return false;
  }
}

function show(url: string, entry: string, open: boolean) {
  const opened = open && openBrowser(entry);
  console.log("");
  console.log(`  ${styleText("green", "●")} engenty wizards is running: ${styleText("cyan", url)}`);
  if (opened) {
    console.log(styleText("dim", "    The studio opens in your browser."));
  } else {
    console.log(`    Open the studio: ${entry}`);
    console.log(styleText("dim", "    The link lets one browser in and works once."));
  }
}

/** The command of this install, as it is on disk now: `wizards <args>`. */
function spawnCommand(paths: Layout, args: string[], options: SpawnOptions): ChildProcess {
  const wrapper = join(paths.bin, "wizards");
  return existsSync(wrapper)
    ? spawn(wrapper, args, options)
    : spawn(process.execPath, [join(packageRoot, "bin/wizards.mjs"), ...args], options);
}

/**
 * `wizards start --no-open` detached from this terminal, its output in logs/runtime.log; the
 * runtime once it answers, or null when it ended or did not answer within a minute.
 */
export async function startInBackground(paths: Layout): Promise<Running | null> {
  const { dataDir } = settings(paths);
  mkdirSync(paths.logs, { recursive: true });
  const log = openSync(join(paths.logs, "runtime.log"), "a");
  const child = spawnCommand(paths, ["start", "--no-open"], {
    cwd: paths.home,
    detached: true,
    stdio: ["ignore", log, log],
  });
  let exited = false;
  child.on("error", () => {
    exited = true;
  });
  child.on("exit", () => {
    exited = true;
  });
  child.unref();
  const began = Date.now();
  while (!exited && Date.now() - began < START_TIMEOUT_MS) {
    await new Promise((wait) => setTimeout(wait, 300));
    const started = await runningRuntime(dataDir);
    if (started) {
      return started;
    }
  }
  return null;
}

/**
 * Starts the runtime of this install and opens the studio: in the foreground, or with
 * `background` detached from this terminal. If one already runs on the same data folder
 * (another terminal, the desktop app), that one is opened instead.
 */
export async function start(
  paths: Layout,
  options: { open: boolean; background?: boolean },
): Promise<number> {
  const { fileEnv, dataDir, port: wanted, appUrl } = settings(paths);
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(paths.logs, { recursive: true });

  const running = await runningRuntime(dataDir);
  if (running) {
    show(running.url, entryUrl(running, dataDir), options.open);
    console.log(styleText("dim", "    It was already running; stop it with `wizards stop`."));
    return 0;
  }

  if (options.background) {
    const started = await startInBackground(paths);
    if (!started) {
      console.error(`engenty wizards did not start; see ${join(paths.logs, "runtime.log")}.`);
      return 1;
    }
    show(started.url, entryUrl(started, dataDir), options.open);
    console.log(
      styleText(
        "dim",
        `    It runs in the background; stop it with \`wizards stop\`. Its log: ${join(paths.logs, "runtime.log")}`,
      ),
    );
    return 0;
  }

  const port = wanted ?? (await freePort());
  if (!wanted && port !== DEFAULT_PORT) {
    console.log(styleText("dim", `  Port ${DEFAULT_PORT} is taken, using ${port}.`));
  }
  const accessKey = randomBytes(24).toString("hex");
  const url = appUrl || `http://localhost:${port}`;
  const child = spawn(process.execPath, [join(packageRoot, "apps/runtime/dist/index.js")], {
    cwd: paths.home,
    env: {
      ...runtimeEnv(paths, { port, url, dataDir, accessKey }, process.env, fileEnv),
      // This command starts it again when it exits with RESTART_EXIT.
      ENGENTY_WIZARDS_RESTARTS: "1",
    },
    stdio: ["ignore", "inherit", "inherit"],
  });
  let current: ChildProcess = child;

  let exited: number | null = null;
  const ended = new Promise<number>((done) => {
    child.on("error", (error) => {
      console.error(`The runtime did not start: ${error.message}`);
      exited = 1;
      done(1);
    });
    child.on("exit", (code, signal) => {
      exited = code ?? (signal ? 0 : 1);
      done(exited);
    });
  });
  // Ctrl-C reaches the runtime as well (same terminal); it closes its browser and its databases.
  process.on("SIGINT", () => undefined);
  process.on("SIGTERM", () => current.kill("SIGTERM"));

  const began = Date.now();
  while (exited === null && !(await healthy(port))) {
    if (Date.now() - began > START_TIMEOUT_MS) {
      child.kill("SIGTERM");
      console.error("The runtime did not answer within 60 seconds.");
      return 1;
    }
    await new Promise((wait) => setTimeout(wait, 150));
  }
  if (exited !== null) {
    return exited || 1;
  }
  show(url, `${url}/api/local/enter?k=${accessKey}`, options.open);
  console.log(styleText("dim", "    Stop it with Ctrl-C."));
  console.log("");
  const code = await ended;
  if (code !== RESTART_EXIT) {
    return code;
  }
  // Updated or `wizards restart`: the command as it is on disk now starts it again, in this
  // terminal or under the login item, which keeps waiting on this process.
  console.log(styleText("dim", "  Starting it again."));
  current = spawnCommand(paths, ["start", "--no-open"], { stdio: "inherit" });
  return new Promise<number>((done) => {
    current.on("error", () => done(1));
    current.on("exit", (exit) => done(exit ?? 0));
  });
}

/** `wizards open`: lets the browser into the runtime that runs. */
export async function open(paths: Layout, print: boolean): Promise<number> {
  const { dataDir } = settings(paths);
  const running = await runningRuntime(dataDir);
  if (!running) {
    console.error("engenty wizards is not running. Start it with `wizards`.");
    return 1;
  }
  const entry = entryUrl(running, dataDir);
  if (print || !openBrowser(entry)) {
    console.log(entry);
  }
  return 0;
}
