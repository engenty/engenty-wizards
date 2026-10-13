import * as p from "@clack/prompts";
import {
  accountOverview,
  type KnownTeam,
  knownTeam,
  type LinkedAccount,
  linkedAccount,
  unlink,
} from "../auth/account.js";
import { DeviceSignInError, requestDeviceCode, waitForDeviceSignIn } from "../auth/device.js";
import { migrateControlDb } from "../db/client.js";
import { env } from "../env.js";
import { featuresFile, fileFeatures, writeFeature } from "../features.js";
import { command, type Layout, readInstallNote, writeInstallNote } from "./home.js";
import type { SetupOptions } from "./setup.js";
import { openBrowser, runningRuntime, settings } from "./start.js";
import { bold, busy, cyan, dim, tilde } from "./ui.js";

/**
 * The account of this install, from the terminal. `wizards account` says where it stands,
 * `sign-in` runs the device flow (auth/device.ts), `sign-out` ends the link the way the
 * studio does. The setup's first step is the same sign-in. `--local` keeps an install off the
 * account altogether: `account=off` in the install's `.features` hides every account surface
 * (packages/shared/src/feature-flags.ts), and a note in install.json says so.
 *
 * Everything here reads and writes the install's settings and vault through the runtime's own
 * modules, with or without a runtime running (install-env.ts puts this process where the
 * runtime is). A runtime that runs reads the account from the settings as it goes; what it
 * holds from its start is brought in line by a restart, which is offered.
 */

export const INTRO =
  "Your team, its space and your wizards live in the account. This computer joins the space.";

export type AccountState =
  | { kind: "local" }
  | { kind: "none" }
  | { kind: "linked"; account: LinkedAccount; team: KnownTeam | null };

let prepared: Promise<void> | null = null;

/** The control database as the runtime keeps it: a fresh install has none until something opens it. */
function ready(): Promise<void> {
  prepared ??= migrateControlDb();
  return prepared;
}

/** Set up with `--local`: the install's `.features` says `account=off`. */
export function isLocalOnly(file = featuresFile()): boolean {
  return fileFeatures(file).account === false;
}

/** `--local`: the switch into the file, the note into install.json. */
export function localOnly(paths: Layout, file = featuresFile()): void {
  writeFeature("account", false, file);
  writeInstallNote({ ...readInstallNote(paths), local: true }, paths);
}

/** A sign-in ends local-only: the switch follows the default again, the note goes. */
export function joinedAccount(paths: Layout, file = featuresFile()): void {
  if (isLocalOnly(file)) {
    writeFeature("account", null, file);
  }
  const note = readInstallNote(paths);
  if (note.local) {
    const { local: _, ...rest } = note;
    writeInstallNote(rest, paths);
  }
}

/** Where the account stands, from this machine alone: no round trip. */
export async function accountState(): Promise<AccountState> {
  if (isLocalOnly()) {
    return { kind: "local" };
  }
  await ready();
  const account = await linkedAccount();
  if (!account) {
    return { kind: "none" };
  }
  return { kind: "linked", account, team: await knownTeam() };
}

/** "Matthias · team Platzer Fenster & Türen · 120 credits", as far as it is known. */
export function described(
  account: LinkedAccount,
  team: { name: string; balanceCredits: number } | null,
  credits = true,
): string {
  const parts = [account.name || account.email];
  if (team) {
    parts.push(`team ${team.name}`);
    if (credits) {
      parts.push(`${team.balanceCredits} credits`);
    }
  }
  return parts.join(" · ");
}

/** One line for the menu and `wizards status`, after the symbol. */
export function describeAccount(state: AccountState): string {
  switch (state.kind) {
    case "local":
      return "local only";
    case "none":
      return "not signed in";
    default:
      return described(state.account, state.team, false);
  }
}

/** The account's site, as people know it: engenty.ai for account.engenty.ai. */
const host = () => new URL(env.local.accountUrl).host.replace(/^account\./, "");

/** `wizards account`: where it stands, with the Manage-App's word when it answers. */
async function status(): Promise<number> {
  const state = await accountState();
  if (state.kind === "local") {
    console.log(
      `Local only (no account). ${dim(`\`${command()} account sign-in\` connects one.`)}`,
    );
    return 0;
  }
  if (state.kind === "none") {
    console.log(`Not signed in. ${dim(`\`${command()} account sign-in\``)}`);
    return 0;
  }
  const overview = await accountOverview();
  const team = overview?.tenant ?? state.team;
  console.log(
    `Signed in as ${described(state.account, team)} · ${host()}${
      overview ? "" : dim(`  (${host()} did not answer${team ? "; this is from last time" : ""})`)
    }`,
  );
  return 0;
}

/**
 * The device flow on the terminal: the link and the code, the browser opened where there is
 * one, then a wait while the person allows it. Null when it ended without an account.
 */
async function deviceSignIn(): Promise<LinkedAccount | null> {
  let code: Awaited<ReturnType<typeof requestDeviceCode>>;
  try {
    code = await requestDeviceCode();
  } catch (err) {
    p.log.error((err as Error).message);
    return null;
  }
  const link = code.verificationUriComplete ?? code.verificationUri;
  p.log.message(`Open ${cyan(link)} and type ${bold(code.userCode)}`);
  if (openBrowser(link)) {
    p.log.message(dim("The page opens in your browser."));
  }
  const spinner = busy("Waiting for you to allow it in the browser");
  try {
    const account = await waitForDeviceSignIn(code);
    const overview = await accountOverview();
    spinner.stop(`Signed in as ${described(account, overview?.tenant ?? null)}`);
    return account;
  } catch (err) {
    spinner.fail(
      err instanceof DeviceSignInError
        ? err.message
        : `The sign-in did not work. ${(err as Error).message}`,
    );
    return null;
  }
}

/**
 * A runtime that runs reads the account from the settings as it goes, but holds a few things
 * from its start: the Pro modules it loaded, which source the models run on, what was sent to
 * the cloud. A restart brings it in line; the person is asked, or told how.
 */
async function pickUp(paths: Layout, interactive: boolean, why: string): Promise<void> {
  if (!(await runningRuntime(settings(paths).dataDir))) {
    return;
  }
  const how = `${command()} restart`;
  if (!interactive) {
    p.log.info(`The studio that runs ${why} after ${cyan(how)}.`);
    return;
  }
  const answer = await p.confirm({
    message: `Restart the studio that runs, so it ${why}?`,
    initialValue: true,
  });
  if (p.isCancel(answer) || !answer) {
    p.log.info(dim(`Later: ${how}`));
    return;
  }
  // status.ts shows the account; loaded here when needed, so neither module waits on the other.
  const { restart } = await import("./status.js");
  await restart(paths);
}

const SIGNED_IN = "fetches the Pro modules of your plan and sends what is published to the cloud";

async function signIn(paths: Layout, interactive: boolean): Promise<number> {
  await ready();
  const linked = await linkedAccount();
  if (linked) {
    p.log.info(
      `Already signed in as ${described(linked, await knownTeam(), false)}. ${dim(
        `To switch: \`${command()} account sign-out\` first.`,
      )}`,
    );
    return 0;
  }
  const account = await deviceSignIn();
  if (!account) {
    return 1;
  }
  joinedAccount(paths);
  p.log.message(dim("What you publish here runs in the cloud too."));
  await pickUp(paths, interactive, SIGNED_IN);
  return 0;
}

async function signOut(paths: Layout, interactive: boolean): Promise<number> {
  const state = await accountState();
  if (state.kind !== "linked") {
    console.log(
      state.kind === "local" ? "Local only: there is no account to sign out." : "Not signed in.",
    );
    return 0;
  }
  const spinner = busy(`Signing out ${state.account.name || state.account.email}`);
  await unlink();
  // The same as the studio's sign-out (DELETE /api/studio/account): what was sent to the cloud
  // is forgotten, the entitlement goes with the account's plan, and models that ran on its
  // credits run on own keys again. This process never loaded Pro modules or models, so only the
  // settings change here; a runtime that runs lets go of its modules on restart.
  const [{ forgetCloud }, { refreshPro }, models] = await Promise.all([
    import("../services/cloud.js"),
    import("../plugins/pro.js"),
    import("../models.js"),
  ]);
  await forgetCloud();
  await refreshPro();
  await models.loadLocalModels();
  if (models.localModelSettings().source === "account") {
    await models.saveLocalModels({ source: "own" });
  }
  spinner.stop("Signed out. Your wizards and results stay on this computer.");
  await pickUp(paths, interactive, "lets go of the account");
  return 0;
}

/** `wizards account [sign-in|sign-out]`. */
export async function accountCommand(
  paths: Layout,
  value: string,
  options: { yes: boolean },
): Promise<number> {
  const interactive = !options.yes && Boolean(process.stdin.isTTY && process.stdout.isTTY);
  switch (value) {
    case "":
      return status();
    case "sign-in":
    case "signin":
    case "login":
      return signIn(paths, interactive);
    case "sign-out":
    case "signout":
    case "logout":
      return signOut(paths, interactive);
    default:
      console.error(`${command()} account [sign-in|sign-out]`);
      return 2;
  }
}

/** The menu's "Account": where it stands, and the way in or out. */
export async function accountMenu(paths: Layout): Promise<void> {
  await status();
  const state = await accountState();
  const action = await p.select<"sign-in" | "sign-out" | "back">({
    message: "Account",
    options: [
      state.kind === "linked"
        ? { value: "sign-out", label: "Sign out", hint: "your wizards and results stay here" }
        : { value: "sign-in", label: "Sign in", hint: "with a code, in your browser" },
      { value: "back", label: "Back" },
    ],
  });
  if (p.isCancel(action) || action === "back") {
    return;
  }
  if (action === "sign-in") {
    await signIn(paths, true);
  } else {
    await signOut(paths, true);
  }
}

/**
 * The setup's first step. `--local` keeps the install off the account; else the person is
 * asked to sign in, unless the setup runs without a terminal (`--yes`), which says how to do
 * it later.
 */
export async function accountStep(
  paths: Layout,
  options: SetupOptions,
  interactive: boolean,
): Promise<"cancelled" | undefined> {
  if (options.local) {
    localOnly(paths);
    p.log.warn(
      `Local only. No account, nothing leaves this computer. Wizards, the space and results stay in ${tilde(settings(paths).dataDir)}. Links answer on this computer only.`,
    );
    p.log.message(dim(`Connect an account any time: ${command()} account`));
    return;
  }
  const state = await accountState();
  if (state.kind === "local") {
    p.log.info(`Local only (no account). ${dim(`\`${command()} account sign-in\` connects one.`)}`);
    return;
  }
  if (state.kind === "linked") {
    const overview = await accountOverview();
    p.log.success(`Signed in as ${described(state.account, overview?.tenant ?? state.team)}`);
    return;
  }
  p.note(INTRO, "Your engenty account");
  if (!interactive) {
    p.log.info(dim(`Sign in later: ${command()} account sign-in`));
    return;
  }
  const answer = await p.confirm({ message: "Sign in now?", initialValue: true });
  if (p.isCancel(answer)) {
    p.cancel(`Setup stopped. Run it again with \`${command()} setup\`.`);
    return "cancelled";
  }
  if (!answer) {
    p.log.info(dim(`Later: ${command()} account`));
    return;
  }
  const account = await deviceSignIn();
  if (!account) {
    p.log.info(dim(`Later: ${command()} account sign-in`));
    return;
  }
  joinedAccount(paths);
  p.log.message(dim("What you publish here runs in the cloud too."));
  await pickUp(paths, interactive, SIGNED_IN);
}
