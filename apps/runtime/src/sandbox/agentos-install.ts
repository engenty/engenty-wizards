import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { wizardsHome } from "../cli/home.js";

/**
 * agentOS is not a dependency of engenty wizards: it weighs about 340 MB, and only the computers
 * and servers that run the sandbox with it need it. It is installed on demand into a folder of
 * its own (`wizards sandbox add`, or this file run with node), and the engine loads it from there.
 */
export const AGENTOS_VERSION = "0.4.1";

const CORE = "@rivet-dev/agentos-core";
/** The helper agentOS ships for each platform, beside the core: `<package>/agentos-native-sidecar`. */
const SIDECAR_PACKAGE = "@rivet-dev/agentos-runtime-sidecar-";
/** Where the core keeps its programs, compiled to WebAssembly. */
const COMMANDS = join("node_modules", "@rivet-dev", "agentos-runtime-core", "commands");

/**
 * Programs agentOS ships but leaves off the PATH; the install packs them so every VM has them.
 * The ones from the `@agentos-software` registry are in a format 0.4 no longer reads.
 */
export const AGENTOS_EXTRA_COMMANDS = ["curl", "git", "jq", "sqlite3", "unzip", "zip"] as const;

/** Dependencies of the core that its code never imports: Google and AWS clients, about 140 MB. */
const UNUSED = ["googleapis", "googleapis-common", "@aws-sdk", "@smithy", "better-sqlite3"];

/** Written last: a folder without it is an install that did not finish. */
const MARKER = "agentos.json";

/** agentOS ships its helper for macOS and glibc Linux, on arm64 and x64. */
export function agentOsSupported(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): boolean {
  return ["darwin", "linux"].includes(platform) && ["arm64", "x64"].includes(arch);
}

/** Where `wizards sandbox add` puts it: `~/.engenty/wizards/engines/agentos`. */
export function defaultAgentOsDir(): string {
  return join(wizardsHome(), "engines", "agentos");
}

/** The version installed in `dir`, or null when nothing usable is there. */
export function agentOsVersion(dir: string): string | null {
  try {
    const { version } = JSON.parse(readFileSync(join(dir, MARKER), "utf8"));
    return typeof version === "string" && existsSync(agentOsEntry(dir)) ? version : null;
  } catch {
    return null;
  }
}

/** The core's module, for `import()`. */
export function agentOsEntry(dir: string): string {
  const root = join(dir, "node_modules", CORE);
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const entry = pkg.exports?.["."]?.import ?? pkg.exports?.["."]?.default ?? pkg.main;
  return join(root, entry);
}

/** The package of extra programs every VM gets (AGENTOS_EXTRA_COMMANDS). */
export const agentOsExtras = (dir: string) => join(dir, "extras");

/** The helper with its routine lines filtered out, or null where there is no bash. */
export const agentOsSidecar = (dir: string) => join(dir, "sidecar.sh");

export type RunNpm = (args: string[]) => Promise<{ code: number; tail: string }>;

/**
 * Installs agentOS into `dir` with the given npm, replacing what was there. Install scripts do
 * not run: the one package that has some (better-sqlite3) is among the unused ones.
 */
export async function installAgentOs(dir: string, npm: RunNpm): Promise<string> {
  if (!agentOsSupported()) {
    throw new Error(`agentOS runs on macOS and Linux (arm64, x64), not on ${process.platform}.`);
  }
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), '{ "private": true }\n');
  const result = await npm([
    "install",
    "--prefix",
    dir,
    "--no-audit",
    "--no-fund",
    "--ignore-scripts",
    "--loglevel=error",
    `${CORE}@${AGENTOS_VERSION}`,
  ]);
  if (result.code !== 0) {
    throw new Error(`npm couldn’t install agentOS: ${result.tail.trim().split("\n").at(-1)}`);
  }
  for (const name of UNUSED) {
    rmSync(join(dir, "node_modules", name), { recursive: true, force: true });
  }
  packExtras(dir);
  writeSidecarWrapper(dir);
  writeFileSync(join(dir, MARKER), `${JSON.stringify({ version: AGENTOS_VERSION }, null, 2)}\n`);
  return AGENTOS_VERSION;
}

/** An agentOS package is a folder with a manifest and its programs in `bin/`. */
function packExtras(dir: string) {
  const bin = join(agentOsExtras(dir), "bin");
  mkdirSync(bin, { recursive: true });
  for (const command of AGENTOS_EXTRA_COMMANDS) {
    const target = join(bin, command);
    copyFileSync(join(dir, COMMANDS, command), target);
    // Without the mode, the VM finds the program and refuses to run it.
    chmodSync(target, 0o755);
  }
  writeFileSync(
    join(agentOsExtras(dir), "agentos-package.json"),
    `${JSON.stringify({ name: "engenty-wizards-extras", version: AGENTOS_VERSION })}\n`,
  );
}

/**
 * The helper prints a line on stderr for every engine it keeps warm, a few per command, and
 * agentOS passes its stderr on to the server's. The wrapper leaves those lines out.
 */
function writeSidecarWrapper(dir: string) {
  const bash = ["/bin/bash", "/usr/bin/bash"].find((path) => existsSync(path));
  const modules = join(dir, "node_modules", "@rivet-dev");
  const platform = readdirSync(modules).find((name) =>
    `@rivet-dev/${name}`.startsWith(SIDECAR_PACKAGE),
  );
  const helper = platform && join(modules, platform, "agentos-native-sidecar");
  if (!bash || !helper || !existsSync(helper)) {
    return;
  }
  const quoted = `'${helper.replaceAll("'", `'\\''`)}'`;
  writeFileSync(
    agentOsSidecar(dir),
    `#!${bash}\n` +
      "# agentOS's helper without the lines it prints for every engine it keeps warm.\n" +
      `exec ${quoted} "$@" 2> >(grep --line-buffered -v -e '^agentos-v8-runtime: ' -e 'vfs::posix::tar_fs' >&2)\n`,
  );
  chmodSync(agentOsSidecar(dir), 0o755);
}

export function removeAgentOs(dir: string) {
  rmSync(dir, { recursive: true, force: true });
}

/** `node apps/runtime/dist/sandbox/agentos-install.js`: an image or a checkout installs it so. */
if (import.meta.main) {
  const { spawn } = await import("node:child_process");
  const dir = process.env.AGENTOS_DIR?.trim() || defaultAgentOsDir();
  const npm: RunNpm = (args) =>
    new Promise((resolve) => {
      const child = spawn("npm", args, { stdio: ["ignore", "inherit", "inherit"] });
      child.on("error", (err) => resolve({ code: 127, tail: err.message }));
      child.on("close", (code) => resolve({ code: code ?? 1, tail: "" }));
    });
  try {
    const version = await installAgentOs(dir, npm);
    console.log(`agentOS ${version} is installed in ${dir}.`);
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}
