import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import * as p from "@clack/prompts";
import { autostartState, setAutostart } from "./autostart.js";
import { installClient, installCommand } from "./clients.js";
import { runLogged } from "./exec.js";
import {
  installedByScript,
  isCheckout,
  type Layout,
  packageVersion,
  readInstallNote,
  writeInstallNote,
} from "./home.js";
import {
  CLIENTS,
  type Client,
  type ClientState,
  detectClients,
  findChrome,
  findFfmpeg,
  findOnPath,
  suggestedClient,
  vendorApp,
} from "./machine.js";
import { badge, cyan, dim, tilde } from "./ui.js";

export interface SetupOptions {
  /** Ask nothing and install nothing optional: say what is there and what is missing. */
  yes: boolean;
  /** Clients to install without asking (`--client codex`). */
  clients: string[];
}

/** What the person wants after the setup. */
export type Next = "start" | "later";

/** The studio as an app of its own: Chrome (or Edge) installs it from the page. */
const CHROME_APP =
  "Tip: in Chrome or Edge the studio installs as an app, in a window of its own with its own icon. The studio offers it at the top; or use the install icon in the address bar.";

/** How this install is started, as the person types it. */
export const command = () =>
  installedByScript() ? "engenty-wizards" : isCheckout() ? "pnpm wizards" : "npx engenty-wizards";

/** A spinner on a terminal; where nobody watches, only what came of it. */
function busy(message: string) {
  if (!process.stdout.isTTY) {
    return { stop: (text: string) => p.log.step(text), fail: (text: string) => p.log.warn(text) };
  }
  const spinner = p.spinner();
  spinner.start(message);
  return {
    stop: (text: string) => spinner.stop(text),
    fail: (text: string) => spinner.error(text),
  };
}

function cancelled<T>(value: T | symbol): value is symbol {
  if (p.isCancel(value)) {
    p.cancel(`Setup stopped. Run it again with \`${command()} setup\`.`);
    return true;
  }
  return false;
}

async function install(client: Client, paths: Layout): Promise<boolean> {
  const task = p.taskLog({ title: `Installing ${client.name}`, limit: 6 });
  task.message(dim(installCommand(client, paths)));
  const { code, tail } = await installClient(client, paths, (line) => task.message(line));
  const installed = (await detectClients(paths)).find((state) => state.client.id === client.id);
  if (code === 0 && installed?.path) {
    task.success(`${client.name} ${installed.version ?? ""} installed`.trim());
    return true;
  }
  task.error(
    `${client.name} was not installed${code === 0 ? ": its command is not on the PATH" : ""}. ${tail.split("\n").pop() ?? ""}`,
  );
  return false;
}

async function clientsStep(
  paths: Layout,
  options: SetupOptions,
  interactive: boolean,
): Promise<boolean | "cancelled"> {
  const spinner = busy("Looking for AI clients on this machine");
  const found = await detectClients(paths);
  const installed = found.filter((state) => state.path);
  const missing = found.filter((state) => !state.path);
  spinner.stop(
    installed.length
      ? `Thinks with: ${installed.map((s) => `${s.client.name} ${s.version}`).join(", ")}`
      : "No AI client on this machine yet",
  );

  if (!installed.length) {
    p.log.message(dim("engenty wizards thinks with one, on the subscription you already have."));
  }

  let wanted: ClientState[] = missing.filter((s) => options.clients.includes(s.client.id));
  if (interactive && missing.length && !wanted.length) {
    const suggested = suggestedClient(missing);
    // A client whose app is on this Mac comes first: its subscription is most likely paid for.
    const offered = [...missing].sort(
      (a, b) => Number(!vendorApp(a.client)) - Number(!vendorApp(b.client)),
    );
    const answer = await p.multiselect({
      message: installed.length
        ? "Install another AI client? (space to pick, enter to go on)"
        : "Which one shall I install?",
      options: offered.map(({ client }) => {
        const app = vendorApp(client);
        return {
          value: client.id,
          label: client.name,
          hint: [
            `${client.account} subscription`,
            app ? `the ${app} app is on this Mac` : "",
            !installed.length && client.id === suggested?.client.id ? "recommended" : "",
          ]
            .filter(Boolean)
            .join(", "),
        };
      }),
      initialValues: installed.length || !suggested ? [] : [suggested.client.id],
      required: false,
    });
    if (cancelled(answer)) {
      return "cancelled";
    }
    wanted = missing.filter((s) => answer.includes(s.client.id));
  }
  let any = installed.length > 0;
  for (const { client } of wanted) {
    any = (await install(client, paths)) || any;
  }
  if (any) {
    p.log.info("You sign the client in on the first page of the studio.");
  } else {
    p.log.warn(
      `No AI client yet: the first page of the studio installs one, or takes an API key (Vercel AI Gateway, OpenAI, Anthropic) or a local model (Ollama).\n${dim(
        `Or here, later: ${CLIENTS.map((c) => c.name).join(", ")} with \`${command()} setup\`.`,
      )}`,
    );
  }
  return any;
}

async function toolsStep(interactive: boolean): Promise<"cancelled" | undefined> {
  const chrome = findChrome();
  if (chrome) {
    p.log.success(`Browser for PDF and PNG: ${dim(tilde(chrome))}`);
  } else {
    p.log.warn(
      "No Chrome, Edge or Chromium: PDF and PNG exports and browser steps need one.\nhttps://www.google.com/chrome",
    );
  }
  const ffmpeg = await findFfmpeg();
  if (ffmpeg.path) {
    p.log.success(`ffmpeg ${ffmpeg.version ?? ""} for videos`.replace("  ", " "));
    return;
  }
  const brew = findOnPath("brew", process.env.PATH ?? "");
  if (!interactive || !brew) {
    p.log.warn(
      `No ffmpeg: MP4 videos of animated widgets need it.${brew ? `\n${dim("brew install ffmpeg")}` : ""}`,
    );
    return;
  }
  const answer = await p.confirm({
    message: "No ffmpeg (for MP4 videos of animated widgets). Install it with Homebrew?",
    initialValue: false,
  });
  if (cancelled(answer)) {
    return "cancelled";
  }
  if (answer) {
    const task = p.taskLog({ title: "Installing ffmpeg", limit: 6 });
    const { code, tail } = await runLogged(brew, ["install", "ffmpeg"], {
      onLine: (line) => task.message(line),
    });
    if (code === 0) {
      task.success("ffmpeg installed");
    } else {
      task.error(`ffmpeg was not installed. ${tail.split("\n").pop() ?? ""}`);
    }
  }
}

/**
 * Starting at login: on a Mac a LaunchAgent starts the runtime, on Linux a systemd user
 * service does. Asked, never assumed; `autostart off` undoes it.
 */
async function autostartStep(
  paths: Layout,
  interactive: boolean,
): Promise<"cancelled" | undefined> {
  const state = await autostartState(paths);
  if ("unavailable" in state) {
    return;
  }
  if (state.on) {
    p.log.success(`Starts at login: ${dim(state.how)}`);
    return;
  }
  if (!interactive) {
    p.log.info(dim(`To start it at login: \`${command()} autostart on\``));
    return;
  }
  const answer = await p.confirm({
    message:
      "Start engenty wizards when you log in? It keeps running in the background, so links and AI clients always reach it.",
    initialValue: true,
  });
  if (cancelled(answer)) {
    return "cancelled";
  }
  if (!answer) {
    p.log.info(dim(`Later: \`${command()} autostart on\``));
    return;
  }
  try {
    const after = await setAutostart(paths, true);
    if ("on" in after && after.on) {
      p.log.success(`Starts at login: ${dim(after.how)}`);
    } else {
      p.log.warn("Starting at login could not be switched on.");
    }
  } catch (error) {
    p.log.warn(`Starting at login could not be switched on. ${(error as Error).message}`);
  }
}

/** The line that puts `~/.local/bin` on the PATH, and the shell file it belongs in. */
function pathLine(): { file: string; line: string } {
  const shell = process.env.SHELL ?? "";
  if (shell.endsWith("fish")) {
    return {
      file: join(homedir(), ".config/fish/config.fish"),
      line: "fish_add_path ~/.local/bin",
    };
  }
  const file = shell.endsWith("zsh")
    ? ".zshrc"
    : process.platform === "darwin"
      ? ".bash_profile"
      : ".bashrc";
  return { file: join(homedir(), file), line: 'export PATH="$HOME/.local/bin:$PATH"' };
}

/** An install made by wizards.sh has its command in `~/.local/bin`: is that on the PATH? */
async function pathStep(interactive: boolean): Promise<"cancelled" | undefined> {
  const local = join(homedir(), ".local", "bin");
  if (!installedByScript() || (process.env.PATH ?? "").split(delimiter).includes(local)) {
    return;
  }
  const { file, line } = pathLine();
  if (existsSync(file) && readFileSync(file, "utf8").includes(".local/bin")) {
    p.log.info(`Open a new terminal to use the \`engenty-wizards\` command.`);
    return;
  }
  const hint = `Until then: ${tilde(join(local, "engenty-wizards"))}`;
  if (!interactive) {
    p.log.warn(`~/.local/bin is not on your PATH. Add to ${tilde(file)}:\n${line}\n${dim(hint)}`);
    return;
  }
  const answer = await p.confirm({
    message: `The \`engenty-wizards\` command is in ~/.local/bin, which is not on your PATH. Add it in ${tilde(file)}?`,
    initialValue: true,
  });
  if (cancelled(answer)) {
    return "cancelled";
  }
  if (answer) {
    appendFileSync(file, `\n# engenty wizards\n${line}\n`);
    p.log.success(`Added to ${tilde(file)}. It works in a new terminal.\n${dim(hint)}`);
  } else {
    p.log.info(hint);
  }
}

/**
 * The guided setup: what this machine has, what is missing, and what to install — an AI client
 * to think with, ffmpeg, starting at login. Returns what to do next, or null when it was stopped.
 */
export async function setup(paths: Layout, options: SetupOptions): Promise<Next | null> {
  const interactive = !options.yes && Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const version = packageVersion();
  p.intro(`${badge("engenty wizards")} ${dim(version)}`);
  p.log.message(
    [
      `Install  ${tilde(paths.home)}${installedByScript() ? "" : dim(`  (data; the code runs from ${isCheckout() ? "this checkout" : "npm"})`)}`,
      `Node     ${process.version}  ${dim(tilde(process.execPath))}`,
    ].join("\n"),
  );

  if ((await clientsStep(paths, options, interactive)) === "cancelled") {
    return null;
  }
  if ((await toolsStep(interactive)) === "cancelled") {
    return null;
  }
  if ((await autostartStep(paths, interactive)) === "cancelled") {
    return null;
  }
  if ((await pathStep(interactive)) === "cancelled") {
    return null;
  }
  writeInstallNote(
    { ...readInstallNote(paths), setupAt: new Date().toISOString(), version },
    paths,
  );

  p.log.info(CHROME_APP);
  if (!interactive) {
    p.outro(`Start it with ${cyan(command())}`);
    return "later";
  }
  const next = await p.select<Next>({
    message: "All set. What next?",
    options: [
      { value: "start", label: "Start it here", hint: "the studio opens in your browser" },
      { value: "later", label: "Not now" },
    ],
  });
  if (cancelled(next)) {
    return null;
  }
  if (next === "later") {
    p.outro(`Start it with ${cyan(command())}`);
  } else {
    p.outro("Starting engenty wizards");
  }
  return next;
}
