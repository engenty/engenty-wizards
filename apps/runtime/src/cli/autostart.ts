import { execFile } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { findApp } from "./desktop.js";
import { installedByScript, type Layout } from "./home.js";
import { findOnPath } from "./machine.js";

const run = promisify(execFile);

/**
 * engenty wizards starting by itself when the person logs in, so that links and AI clients
 * reach it without anybody starting it. On a Mac that is the Mac app: a LaunchAgent opens it in
 * the menu bar without its window, and it starts the runtime as when it is opened by hand. The
 * app's menu ("Open at Login") writes the same file (apps/desktop/src-tauri/src/login.rs). On
 * Linux it is a systemd user service that runs `engenty-wizards start --no-open`.
 */

const LOGIN_LABEL = "com.engenty.wizards.login";

/** The Mac app's login item. */
export const LOGIN_ITEM = join(homedir(), "Library", "LaunchAgents", `${LOGIN_LABEL}.plist`);

const xml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** The LaunchAgent that opens the app through Launch Services, as login.rs writes it. */
export function loginItemText(app: string): string {
  const program = ["/usr/bin/open", "-g", "-a", app, "--args", "--at-login"];
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

const MAC_HOW = "the Mac app opens in the menu bar and starts it";
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
  if (process.platform === "darwin") {
    if (!findApp()) {
      return { unavailable: "it is the Mac app that opens at login, and it is not installed" };
    }
    return { on: existsSync(LOGIN_ITEM), how: MAC_HOW };
  }
  if (process.platform !== "linux") {
    return { unavailable: `not on ${process.platform}` };
  }
  if (!installedByScript(paths)) {
    return { unavailable: "only for an install made by wizards.sh" };
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
      writeFileSync(LOGIN_ITEM, loginItemText(findApp() as string));
    } else {
      rmSync(LOGIN_ITEM, { force: true });
    }
    return { on: existsSync(LOGIN_ITEM), how: MAC_HOW };
  }
  const file = unitFile();
  if (on) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, unitText(join(paths.home, "bin", "engenty-wizards")));
    await run("systemctl", ["--user", "daemon-reload"]);
    await run("systemctl", ["--user", "enable", "--now", UNIT]);
  } else {
    await run("systemctl", ["--user", "disable", "--now", UNIT]).catch(() => undefined);
    rmSync(file, { force: true });
    await run("systemctl", ["--user", "daemon-reload"]).catch(() => undefined);
  }
  return autostartState(paths);
}
