import { accessSync, constants, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { appState } from "./desktop.js";
import { installedByScript, isCheckout, type Layout, packageRoot, packageVersion } from "./home.js";
import { detectClients, findChrome, findFfmpeg, nodeIsCurrent } from "./machine.js";
import { runningRuntime, settings } from "./start.js";
import { bad, badge, cyan, dim, no, ok, tilde } from "./ui.js";

/**
 * What is installed and what runs. With `checks` (`doctor`) it also says what is wrong and
 * returns 1 when something is.
 */
export async function status(paths: Layout, checks: boolean): Promise<number> {
  const { dataDir } = settings(paths);
  const [running, clients, ffmpeg, app] = await Promise.all([
    runningRuntime(dataDir),
    detectClients(paths),
    findFfmpeg(),
    appState(),
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
  if (process.platform === "darwin") {
    row(
      "Mac app",
      app ? `${ok} ${app.version ?? ""} ${dim(tilde(app.path))}` : `${no} not installed`,
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
      `  ${no} No AI client: the studio needs an API key or Ollama instead. ${dim("`setup` installs one.")}`,
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

/** Stops the runtime that runs on this install's data folder. */
export async function stop(paths: Layout): Promise<number> {
  const { dataDir } = settings(paths);
  const running = await runningRuntime(dataDir);
  if (!running) {
    console.log("engenty wizards is not running.");
    return 0;
  }
  process.kill(running.pid, "SIGTERM");
  for (let waited = 0; waited < 8000; waited += 100) {
    try {
      process.kill(running.pid, 0);
    } catch {
      console.log(`Stopped (pid ${running.pid}). Your data is kept.`);
      return 0;
    }
    await new Promise((wait) => setTimeout(wait, 100));
  }
  console.error(`The runtime (pid ${running.pid}) did not stop within 8 seconds.`);
  return 1;
}
