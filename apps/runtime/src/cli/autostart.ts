import { execFile } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { installedByScript, type Layout } from "./home.js";
import { findOnPath } from "./machine.js";

const run = promisify(execFile);

/**
 * engenty wizards starting by itself when the person logs in, so that links and AI clients
 * reach it without anybody starting it: `wizards start --no-open`, on a Mac from a
 * LaunchAgent, on Linux from a systemd user service. Only for an install made by install.sh,
 * whose command stays where it is.
 */

const LOGIN_LABEL = "com.engenty.wizards.login";

/** The LaunchAgent. */
export const LOGIN_ITEM = join(homedir(), "Library", "LaunchAgents", `${LOGIN_LABEL}.plist`);

const xml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** The LaunchAgent: the command of this install, started again when it fails. */
export function loginItemText(command: string, log: string): string {
  const program = [command, "start", "--no-open"];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LOGIN_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${program.map((arg) => `    <string>${xml(arg)}</string>\n`).join("")}  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>${xml(log)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(log)}</string>
  <key>ProcessType</key>
  <string>Interactive</string>
</dict>
</plist>
`;
}

const UNIT = "engenty-wizards.service";

export function unitFile(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "systemd", "user", UNIT);
}

/** The systemd user service: the command of this install, started again when it fails. */
export function unitText(command: string): string {
  return [
    "[Unit]",
    "Description=engenty wizards",
    "Documentation=https://github.com/engenty/engenty-wizards",
    "",
    "[Service]",
    `ExecStart="${command.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}" start --no-open`,
    "Restart=on-failure",
    "RestartSec=5",
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  ].join("\n");
}

/** Whether it starts at login, or why it cannot here. */
export type Autostart = { on: boolean; how: string } | { unavailable: string };

const MAC_HOW = `a LaunchAgent, ${LOGIN_LABEL}`;
const LINUX_HOW = `a systemd user service, ${UNIT}`;

async function systemdHere(): Promise<boolean> {
  if (!findOnPath("systemctl", process.env.PATH ?? "")) {
    return false;
  }
  try {
    await run("systemctl", ["--user", "show-environment"], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

export async function autostartState(paths: Layout): Promise<Autostart> {
  if (process.platform !== "darwin" && process.platform !== "linux") {
    return { unavailable: `not on ${process.platform}` };
  }
  if (!installedByScript(paths)) {
    return { unavailable: "only for an install made by install.sh" };
  }
  if (process.platform === "darwin") {
    return { on: existsSync(LOGIN_ITEM), how: MAC_HOW };
  }
  if (!(await systemdHere())) {
    return { unavailable: "this Linux has no systemd user session" };
  }
  try {
    await run("systemctl", ["--user", "is-enabled", "--quiet", UNIT], { timeout: 10_000 });
    return { on: true, how: LINUX_HOW };
  } catch {
    return { on: false, how: LINUX_HOW };
  }
}

/** Switches it on or off; what it is afterwards, or an error the person can read. */
export async function setAutostart(paths: Layout, on: boolean): Promise<Autostart> {
  const state = await autostartState(paths);
  if ("unavailable" in state) {
    return state;
  }
  if (process.platform === "darwin") {
    // Takes effect at the next login; nothing is started now.
    if (on) {
      mkdirSync(dirname(LOGIN_ITEM), { recursive: true });
      writeFileSync(
        LOGIN_ITEM,
        loginItemText(
          join(paths.home, "bin", "wizards"),
          join(paths.home, "logs", "autostart.log"),
        ),
      );
    } else {
      rmSync(LOGIN_ITEM, { force: true });
    }
    return { on: existsSync(LOGIN_ITEM), how: MAC_HOW };
  }
  const file = unitFile();
  if (on) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, unitText(join(paths.home, "bin", "wizards")));
    await run("systemctl", ["--user", "daemon-reload"]);
    await run("systemctl", ["--user", "enable", "--now", UNIT]);
  } else {
    await run("systemctl", ["--user", "disable", "--now", UNIT]).catch(() => undefined);
    rmSync(file, { force: true });
    await run("systemctl", ["--user", "daemon-reload"]).catch(() => undefined);
  }
  return autostartState(paths);
}
