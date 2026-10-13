#!/usr/bin/env node
// The `wizards` command. Kept to what every Node understands, so that an old one gets a new
// one installed instead of a syntax error.
//
// A copy from npm (`npx wizards`, `npm install -g wizards`) is the way to the install, not the
// install itself. On macOS and Linux it installs engenty wizards into ~/.engenty/wizards with the
// installer it carries (apps/web/dist/install.sh: its own Node, the runtime, the `wizards`
// command), brings an older install there up to its own version, and hands the command to it.
// What needs no install (--version, --help, validate, mcp) runs here, as long as this Node can.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const [major, minor] = process.versions.node.split(".").map(Number);
const currentNode = major > 24 || (major === 24 && minor >= 11);

const args = process.argv.slice(2);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const home = join(
  resolve((process.env.ENGENTY_HOME || "").trim() || join(homedir(), ".engenty")),
  "wizards",
);
const runtime = join(home, "runtime");
const wrapper = join(home, "bin", "wizards");
const RUN_HERE = ["help", "validate", "mcp"];
const tilde = (path) =>
  path.startsWith(homedir() + sep) ? `~${path.slice(homedir().length)}` : path;

function versionOf(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version || null;
  } catch {
    return null;
  }
}

/** Whether version a is older than b, by major, minor and patch. */
function older(a, b) {
  const pa = a.split(/[.+-]/).map(Number);
  const pb = b.split(/[.+-]/).map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) {
      return (pa[i] || 0) < (pb[i] || 0);
    }
  }
  return false;
}

/** The command as cli/main.ts reads it: "" for the menu. */
function commandOf(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    return "help";
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    return "version";
  }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--client") {
      i++;
    } else if (!argv[i].startsWith("-")) {
      return argv[i];
    }
  }
  return "";
}

/** This copy is the one install.sh put into the home folder (Node names this file by its real path). */
function isInstall() {
  try {
    return root.startsWith(realpathSync(runtime) + sep);
  } catch {
    return false;
  }
}

/** The terminal's environment without what npm put in for running this command. */
function terminalEnv() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("npm_") && !["INIT_CWD", "NODE", "COLOR"].includes(key)) {
      env[key] = value;
    }
  }
  env.PATH = (process.env.PATH || "")
    .split(delimiter)
    .filter((dir) => !/[\\/](node_modules[\\/]\.bin|node-gyp-bin)$/.test(dir))
    .join(delimiter);
  return env;
}

/** The installer this copy carries, for its own version; true when it ran to its end. */
function install(version, quiet) {
  const result = spawnSync(
    "bash",
    [join(root, "apps", "web", "dist", "install.sh"), "--no-setup"],
    {
      // A command whose output is read (validate --json, mcp) keeps its stdout to itself.
      stdio: ["ignore", quiet ? 2 : "inherit", "inherit"],
      env: {
        ...terminalEnv(),
        // The same package npm just ran; ENGENTY_WIZARDS_PACKAGE stays an override for tests.
        ENGENTY_WIZARDS_PACKAGE: process.env.ENGENTY_WIZARDS_PACKAGE || `wizards@${version}`,
      },
    },
  );
  return result.status === 0;
}

/** Whether a runtime of the install runs: the note it keeps in its data folder (running.ts). */
function runs() {
  let dataDir = (process.env.DATA_DIR || "").trim();
  try {
    const line = readFileSync(join(home, ".env"), "utf8").match(/^\s*DATA_DIR\s*=\s*(.*?)\s*$/m);
    dataDir = dataDir || (line ? line[1].replace(/^(['"])(.*)\1$/, "$2") : "");
  } catch {
    // no .env: the data folder is where it always is
  }
  try {
    const { pid } = JSON.parse(
      readFileSync(join(resolve(home, dataDir || "data"), "running.json"), "utf8"),
    );
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: it runs, as somebody else.
    return error.code === "EPERM";
  }
}

/** Runs the installed command with these arguments; its exit code. */
function handOver() {
  return new Promise((done) => {
    const child = spawn(wrapper, args, { stdio: "inherit", env: terminalEnv() });
    // Ctrl-C reaches the installed command as well (same terminal); this one waits for it.
    process.on("SIGINT", () => undefined);
    process.on("SIGTERM", () => child.kill("SIGTERM"));
    child.on("error", (error) => {
      console.error(`${wrapper} did not start: ${error.message}`);
      done(127);
    });
    child.on("exit", (code) => done(code ?? 1));
  });
}

const command = commandOf(args);
if (command === "version") {
  console.log(versionOf(root));
  process.exit(0);
}
const fromNpm =
  process.platform !== "win32" && !existsSync(join(root, "pnpm-workspace.yaml")) && !isInstall();
if (fromNpm && (!currentNode || !RUN_HERE.includes(command))) {
  const own = versionOf(root) || "0.0.0";
  const installed = existsSync(wrapper)
    ? versionOf(join(runtime, "node_modules", "wizards"))
    : null;
  if (!installed || older(installed, own)) {
    const quiet = RUN_HERE.includes(command);
    const running = installed && runs();
    if (install(own, quiet)) {
      // What runs is still the old version: it starts again as the new one.
      if (running) {
        spawnSync(wrapper, ["restart"], {
          stdio: ["ignore", quiet ? 2 : "inherit", "inherit"],
          env: terminalEnv(),
        });
      }
    } else if (currentNode && !installed) {
      console.error(
        `The install into ${tilde(home)} failed; this time engenty wizards runs from npm.\n`,
      );
    }
  } else if (older(own, installed)) {
    console.error(
      `${tilde(home)} has engenty wizards ${installed}, newer than ${own}; that one runs.`,
    );
  }
  if (existsSync(wrapper) && versionOf(join(runtime, "node_modules", "wizards"))) {
    process.exit(await handOver());
  }
}
if (!currentNode) {
  console.error(
    `engenty wizards needs Node.js 24.11 or newer. This is ${process.version}.\n` +
      "The installer brings its own and leaves yours alone:\n\n" +
      "  curl -fsSL https://engenty.ai/install.sh | bash\n",
  );
  process.exit(1);
}
await import("../apps/runtime/dist/cli/main.js");
