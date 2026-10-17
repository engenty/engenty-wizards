import { delimiter, dirname, join } from "node:path";
import {
  AGENTOS_VERSION,
  agentOsSupported,
  agentOsVersion,
  installAgentOs,
  removeAgentOs,
} from "../sandbox/agentos-install.js";
import { runtimePath } from "./environment.js";
import { runLogged } from "./exec.js";
import type { Layout } from "./home.js";
import { findOnPath } from "./machine.js";
import { busy, cmd, no, ok, tilde } from "./ui.js";

/** Where agentOS goes: `AGENTOS_DIR`, else `engines/agentos` in the install's folder. */
export const agentOsDir = (paths: Layout) =>
  process.env.AGENTOS_DIR?.trim() || join(paths.home, "engines", "agentos");

/**
 * `wizards sandbox [add|remove]`: the sandbox where AI steps run code, without Docker. agentOS
 * is not part of engenty wizards; `add` downloads it (about 340 MB) beside the install.
 */
export async function sandboxCommand(paths: Layout, value: string): Promise<number> {
  const dir = agentOsDir(paths);
  if (value === "add") {
    return add(paths, dir);
  }
  if (value === "remove") {
    removeAgentOs(dir);
    console.log(`${ok} The sandbox is removed. It goes away with the next ${cmd("restart")}.`);
    return 0;
  }
  if (value) {
    console.error(`Use ${cmd("sandbox add")} or ${cmd("sandbox remove")}.`);
    return 2;
  }
  const version = agentOsVersion(dir);
  console.log(
    version
      ? `${ok} The sandbox (agentOS ${version}) is in ${tilde(dir)}. AI steps run code in it, unless Docker has the engenty-sandbox image.`
      : `${no} No sandbox is installed. AI steps can’t run code unless Docker has the engenty-sandbox image. To add one: ${cmd("sandbox add")}`,
  );
  return 0;
}

async function add(paths: Layout, dir: string): Promise<number> {
  if (!agentOsSupported()) {
    console.error(`${no} The sandbox runs on macOS and Linux only.`);
    return 1;
  }
  const npm = findOnPath(
    "npm",
    [dirname(process.execPath), process.env.PATH ?? ""].join(delimiter),
  );
  if (!npm) {
    console.error(`${no} npm wasn’t found next to this Node.js.`);
    return 1;
  }
  const env = { ...process.env, PATH: runtimePath(paths, process.env) };
  const logFile = join(paths.logs, "install.log");
  const spinner = busy(`Installing the sandbox (agentOS ${AGENTOS_VERSION}, about 340 MB)…`);
  try {
    await installAgentOs(dir, (args) => runLogged(npm, args, { env, logFile }));
  } catch (err) {
    spinner.fail(`The sandbox couldn’t be installed: ${(err as Error).message}`);
    return 1;
  }
  spinner.stop(`${ok} The sandbox is installed in ${tilde(dir)}.`);
  console.log(`AI steps run code in it from the next start: ${cmd("restart")}`);
  return 0;
}
