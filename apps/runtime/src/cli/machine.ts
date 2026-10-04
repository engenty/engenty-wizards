import { execFile } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import { runtimePath } from "./environment.js";
import type { Layout } from "./home.js";

const run = promisify(execFile);

/** How the setup installs an AI client: with npm into the install's own prefix, or by the vendor's script. */
export type ClientInstall = { kind: "npm"; pkg: string } | { kind: "script"; url: string };

export interface Client {
  id: "codex" | "claude" | "gemini" | "cursor";
  name: string;
  bin: string;
  /** The subscription it answers on. */
  account: string;
  install: ClientInstall;
}

/** The AI clients the runtime can think with, in the order its own setup offers them. */
export const CLIENTS: readonly Client[] = [
  {
    id: "codex",
    name: "Codex",
    bin: "codex",
    account: "ChatGPT",
    install: { kind: "npm", pkg: "@openai/codex" },
  },
  {
    id: "claude",
    name: "Claude Code",
    bin: "claude",
    account: "Claude",
    install: { kind: "script", url: "https://claude.ai/install.sh" },
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    bin: "gemini",
    account: "Google",
    install: { kind: "npm", pkg: "@google/gemini-cli" },
  },
  {
    id: "cursor",
    name: "Cursor Agent",
    bin: "cursor-agent",
    account: "Cursor",
    install: { kind: "script", url: "https://cursor.com/install" },
  },
];

/** The first file of that name on a PATH that may be run. */
export function findOnPath(name: string, path: string): string | null {
  for (const dir of path.split(delimiter)) {
    if (!dir) {
      continue;
    }
    const file = join(dir, name);
    try {
      accessSync(file, constants.X_OK);
      return file;
    } catch {
      // not here
    }
  }
  return null;
}

/** What a command prints for `--version`: its last word that looks like one. */
async function versionOf(file: string, path: string): Promise<string | null> {
  try {
    const { stdout } = await run(file, ["--version"], {
      timeout: 10_000,
      env: { ...process.env, PATH: path, TERM: "dumb" },
    });
    const line = stdout.trim().split("\n").pop()?.trim() ?? "";
    return line.match(/\d+\.\d+[\w.+-]*/)?.[0] ?? (line || null);
  } catch {
    return null;
  }
}

export interface Found {
  /** Where it is; null: not on this machine. */
  path: string | null;
  version: string | null;
}

export interface ClientState extends Found {
  client: Client;
}

export async function detectClients(paths: Layout): Promise<ClientState[]> {
  const path = runtimePath(paths, process.env);
  return Promise.all(
    CLIENTS.map(async (client) => {
      const file = findOnPath(client.bin, path);
      // A file that does not answer `--version` is not a client we can run.
      const version = file ? await versionOf(file, path) : null;
      return { client, path: version ? file : null, version };
    }),
  );
}

/** The browser the runtime renders PDF and PNG with. */
export function findChrome(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.CHROME_PATH) {
    return existsSync(env.CHROME_PATH) ? env.CHROME_PATH : null;
  }
  if (process.platform === "darwin") {
    const apps = [
      "Google Chrome.app/Contents/MacOS/Google Chrome",
      "Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "Chromium.app/Contents/MacOS/Chromium",
      "Brave Browser.app/Contents/MacOS/Brave Browser",
    ];
    const roots = ["/Applications", join(homedir(), "Applications")];
    for (const app of apps) {
      for (const root of roots) {
        if (existsSync(join(root, app))) {
          return join(root, app);
        }
      }
    }
    return null;
  }
  for (const name of ["google-chrome", "chromium", "chromium-browser", "microsoft-edge"]) {
    const file = findOnPath(name, env.PATH ?? "");
    if (file) {
      return file;
    }
  }
  return null;
}

export async function findFfmpeg(env: NodeJS.ProcessEnv = process.env): Promise<Found> {
  const path = env.PATH ?? "";
  const file = env.FFMPEG_PATH || findOnPath("ffmpeg", path);
  if (!file) {
    return { path: null, version: null };
  }
  try {
    const { stdout } = await run(file, ["-version"], { timeout: 10_000 });
    return { path: file, version: stdout.match(/ffmpeg version (\S+)/)?.[1] ?? null };
  } catch {
    return { path: null, version: null };
  }
}

/** Node 24.11 or newer: what the runtime is built for. */
export function nodeIsCurrent(version = process.versions.node): boolean {
  const [major, minor] = version.split(".").map(Number);
  return major > 24 || (major === 24 && minor >= 11);
}
