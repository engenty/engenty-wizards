import { accessSync, constants, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { autostartState, setAutostart } from "./autostart.js";
import { installedByScript, isCheckout, type Layout, packageRoot, packageVersion } from "./home.js";
import { detectClients, findChrome, findFfmpeg, nodeIsCurrent } from "./machine.js";
import { entryUrl, runningRuntime, settings, startInBackground } from "./start.js";
import { bad, badge, cyan, dim, no, ok, tilde } from "./ui.js";

/**
 * What is installed and what runs. With `checks` (`doctor`) it also says what is wrong and
 * returns 1 when something is.
 */
export async function status(paths: Layout, checks: boolean): Promise<number> {
  const { dataDir } = settings(paths);
  const [running, clients, ffmpeg, atLogin] = await Promise.all([
    runningRuntime(dataDir),
    detectClients(paths),
    findFfmpeg(),
    autostartState(paths),
  ]);
  const chrome = findChrome();
  const row = (label: string, value: string) => console.log(`  ${label.padEnd(9)} ${value}`);

  console.log(`\n${badge("engenty wizards")} ${dim(packageVersion())}\n`);
  row(
    "Install",
    installedByScript()
      ? tilde(paths.home)
      : `${tilde(packageRoot)} ${dim(isCheckout() ? "(a checkout)" : "(npm)")}`,
  );
  row("Data", tilde(dataDir));
  row("Node", `${process.version} ${dim(tilde(process.execPath))}`);
  row(
    "Running",
    running
      ? `${ok} ${cyan(running.url)} ${dim(`pid ${running.pid}, since ${running.startedAt}`)}`
      : `${no} not running`,
  );
  if (!("unavailable" in atLogin)) {
    row(
      "At login",
      atLogin.on ? `${ok} starts ${dim(`(${atLogin.how})`)}` : `${no} does not start`,
    );
  }
  for (const { client, path, version } of clients) {
    row(
      client.name.split(" ")[0],
      path ? `${ok} ${version} ${dim(tilde(path))}` : `${no} not installed`,
    );
  }
  row("Browser", chrome ? `${ok} ${dim(tilde(chrome))}` : `${no} none for PDF and PNG`);
  row("ffmpeg", ffmpeg.path ? `${ok} ${ffmpeg.version ?? ""}` : `${no} none for MP4`);
  console.log("");
  if (!checks) {
    return 0;
  }

  const problems: string[] = [];
  if (!nodeIsCurrent()) {
    problems.push(`Node ${process.version} is too old: 24.11 or newer is needed.`);
  }
  for (const part of ["apps/runtime/dist/index.js", "apps/web/dist/index.html", "plugin"]) {
    if (!existsSync(join(packageRoot, part))) {
      problems.push(`${part} is missing from this install (${tilde(packageRoot)}).`);
    }
  }
  try {
    mkdirSync(paths.home, { recursive: true });
    accessSync(paths.home, constants.W_OK);
  } catch {
    problems.push(`${tilde(paths.home)} cannot be written to.`);
  }
  if (!clients.some((state) => state.path)) {
    console.log(
      `  ${no} No AI client: the studio needs an API key, Ollama or Apple Intelligence (a Mac) instead. ${dim("`setup` installs one.")}`,
    );
  }
  for (const problem of problems) {
    console.log(`  ${bad} ${problem}`);
  }
  if (!problems.length) {
    console.log(`  ${ok} Nothing wrong with this install.`);
  }
  console.log("");
  return problems.length ? 1 : 0;
}

/** Waits for a process to end; false when it still runs after `ms`. */
async function ended(pid: number, ms: number): Promise<boolean> {
  for (let waited = 0; waited < ms; waited += 100) {
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }
    await new Promise((wait) => setTimeout(wait, 100));
  }
  return false;
}

/** Stops the runtime that runs on this install's data folder. */
export async function stop(paths: Layout): Promise<number> {
  const { dataDir } = settings(paths);
  const running = await runningRuntime(dataDir);
  if (!running) {
    console.log("engenty wizards is not running.");
    return 0;
  }
  process.kill(running.pid, "SIGTERM");
  if (await ended(running.pid, 8000)) {
    console.log(`Stopped (pid ${running.pid}). Your data is kept.`);
    return 0;
  }
  console.error(`The runtime (pid ${running.pid}) did not stop within 8 seconds.`);
  return 1;
}

/**
 * Stops the runtime and starts it again, the version on disk now. One the command started (a
 * terminal, the login item) is started again by that command, where it ran; any other is
 * stopped and started in the background. When nothing runs, it is started in the background.
 */
export async function restart(paths: Layout): Promise<number> {
  const { dataDir } = settings(paths);
  const running = await runningRuntime(dataDir);
  if (running?.restarts && process.platform !== "win32") {
    process.kill(running.pid, "SIGUSR2");
    for (let waited = 0; waited < 60_000; waited += 300) {
      await new Promise((wait) => setTimeout(wait, 300));
      const again = await runningRuntime(dataDir);
      if (again && again.pid !== running.pid) {
        console.log(`${ok} Restarted: ${cyan(again.url)} ${dim(`pid ${again.pid}`)}`);
        return 0;
      }
    }
    console.error("engenty wizards did not start again within a minute.");
    return 1;
  }
  if (running) {
    process.kill(running.pid, "SIGTERM");
    if (!(await ended(running.pid, 8000))) {
      console.error(`The runtime (pid ${running.pid}) did not stop within 8 seconds.`);
      return 1;
    }
  }
  const started = await startInBackground(paths);
  if (!started) {
    console.error(`engenty wizards did not start; see ${join(paths.logs, "runtime.log")}.`);
    return 1;
  }
  console.log(
    `${ok} ${running ? "Restarted" : "Started"}: ${cyan(started.url)} ${dim(`pid ${started.pid}, in the background`)}`,
  );
  if (!running) {
    console.log(`  Open the studio: ${entryUrl(started, dataDir)}`);
  }
  return 0;
}

/** `autostart [on|off]`: whether it starts at login, and the switch. */
export async function autostart(paths: Layout, value: string): Promise<number> {
  if (value && value !== "on" && value !== "off") {
    console.error("autostart takes on or off.");
    return 2;
  }
  let state = await autostartState(paths);
  if (value && !("unavailable" in state)) {
    try {
      state = await setAutostart(paths, value === "on");
    } catch (error) {
      console.error(
        `Starting at login could not be switched ${value}: ${(error as Error).message}`,
      );
      return 1;
    }
  }
  if ("unavailable" in state) {
    console.error(`Starting at login is not possible here: ${state.unavailable}.`);
    return value ? 1 : 0;
  }
  console.log(
    state.on
      ? `${ok} engenty wizards starts at login: ${state.how}.`
      : `${no} engenty wizards does not start at login. ${dim("`autostart on` switches it on.")}`,
  );
  if (state.on && process.platform === "linux") {
    console.log(dim("  Before anybody logs in, too: loginctl enable-linger"));
  }
  return value && state.on !== (value === "on") ? 1 : 0;
}
