import * as p from "@clack/prompts";
import type { Running } from "../running.js";
import { type UpdateStatus, updateStatus } from "../update.js";
import { type Autostart, autostartState, setAutostart } from "./autostart.js";
import { connectCommand } from "./connect.js";
import { command, type Layout, packageVersion, readInstallNote } from "./home.js";
import { type SetupOptions, setup } from "./setup.js";
import { open, runningRuntime, settings, start } from "./start.js";
import { restart, status, stop } from "./status.js";
import { badge, cyan, dim, no, ok } from "./ui.js";
import { update } from "./update.js";

type Action =
  | "start"
  | "foreground"
  | "open"
  | "restart"
  | "stop"
  | "update"
  | "autostart"
  | "connect"
  | "status"
  | "setup"
  | "help"
  | "quit";

interface State {
  running: Running | null;
  atLogin: Autostart;
  release: UpdateStatus | null;
}

async function look(paths: Layout): Promise<State> {
  const { dataDir } = settings(paths);
  const [running, atLogin, release] = await Promise.all([
    runningRuntime(dataDir),
    autostartState(paths),
    updateStatus().catch(() => null),
  ]);
  return { running, atLogin, release };
}

function report({ running, atLogin, release }: State): string {
  const lines = [
    running
      ? `${ok} running  ${cyan(running.url)} ${dim(`pid ${running.pid}, since ${new Date(running.startedAt).toLocaleString()}`)}`
      : `${no} not running`,
  ];
  if (!("unavailable" in atLogin)) {
    lines.push(atLogin.on ? `${ok} starts at login` : `${no} does not start at login`);
  }
  if (release?.newer) {
    lines.push(`${cyan("↑")} ${release.latest} is out ${dim(`(you have ${release.current})`)}`);
  }
  return lines.join("\n");
}

function choices({ running, atLogin, release }: State): p.Option<Action>[] {
  const options: p.Option<Action>[] = running
    ? [
        { value: "open", label: "Open the studio", hint: "in your browser" },
        { value: "restart", label: "Restart" },
        { value: "stop", label: "Stop", hint: "the data is kept" },
      ]
    : [
        { value: "start", label: "Start", hint: "in the background, opens the studio" },
        { value: "foreground", label: "Start here", hint: "in this terminal; Ctrl-C stops it" },
      ];
  options.push({
    value: "update",
    label: "Update",
    hint: release?.newer
      ? `${release.latest} is out`
      : release?.latest
        ? "you have the newest"
        : undefined,
  });
  if (!("unavailable" in atLogin)) {
    options.push({
      value: "autostart",
      label: atLogin.on ? "Don't start at login" : "Start at login",
    });
  }
  options.push(
    { value: "connect", label: "Connect AI apps", hint: "your wizards in Claude, Cursor, Codex …" },
    { value: "status", label: "Status", hint: "what is installed, and what is wrong" },
    { value: "setup", label: "Setup", hint: "AI client, ffmpeg, start at login" },
    { value: "help", label: "Help", hint: "every command" },
    { value: "quit", label: "Quit", hint: running ? "it keeps running" : undefined },
  );
  return options;
}

/**
 * `wizards` on a terminal: what runs, and a menu of what the commands do. The first time, the
 * setup runs first. Returns the exit code; "Start here" ends it with the runtime in the
 * foreground.
 */
export async function menu(
  paths: Layout,
  setupOptions: SetupOptions,
  help: string,
): Promise<number> {
  if (!readInstallNote(paths).setupAt) {
    if (!(await setup(paths, setupOptions))) {
      return 130;
    }
  }

  p.intro(`${badge("engenty wizards")} ${dim(packageVersion())}`);
  for (;;) {
    const spinner = p.spinner();
    spinner.start("Looking at what runs");
    const state = await look(paths);
    spinner.stop(report(state));

    const action = await p.select<Action>({ message: "What now?", options: choices(state) });
    if (p.isCancel(action) || action === "quit") {
      p.outro(dim(`${command()} opens this again; ${command()} help lists every command.`));
      return 0;
    }
    switch (action) {
      case "start":
        await start(paths, { open: true, background: true });
        break;
      case "foreground":
        p.outro("Starting engenty wizards here");
        return start(paths, { open: true });
      case "open":
        await open(paths, false);
        break;
      case "restart":
        await restart(paths);
        break;
      case "stop":
        await stop(paths);
        break;
      case "update": {
        if ((await update(paths)) !== 0) {
          break;
        }
        // This menu is still the old version: what runs restarts into the new one, then it ends.
        if (state.running) {
          await restart(paths);
        }
        p.outro(`Updated. ${cyan(command())} opens the new version.`);
        return 0;
      }
      case "autostart":
        if (!("unavailable" in state.atLogin)) {
          try {
            await setAutostart(paths, !state.atLogin.on);
          } catch (error) {
            p.log.warn(`Starting at login could not be switched: ${(error as Error).message}`);
          }
        }
        break;
      case "connect":
        await connectCommand(paths, [], false);
        break;
      case "status":
        await status(paths, true);
        break;
      case "setup":
        await setup(paths, setupOptions);
        break;
      case "help":
        console.log(help);
        break;
    }
  }
}
