import { homedir } from "node:os";
import { styleText } from "node:util";
import * as p from "@clack/prompts";
import { command } from "./home.js";

const colours = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

/** The name on engenty's orange. */
export const badge = (text: string) =>
  colours ? `\x1b[48;2;224;83;27m\x1b[97m\x1b[1m ${text} \x1b[0m` : text;

export const dim = (text: string) => styleText("dim", text);
export const bold = (text: string) => styleText("bold", text);
export const cyan = (text: string) => styleText("cyan", text);
export const ok = styleText("green", "✓");
export const no = styleText("yellow", "–");
export const bad = styleText("red", "✗");
export const live = styleText("green", "●");

/** A path as the person would write it. */
export const tilde = (path: string) =>
  path.startsWith(homedir()) ? `~${path.slice(homedir().length)}` : path;

/** A command as the person types it, with this install's prefix: `cmd("stop")` → wizards stop. */
export const cmd = (args = "") => cyan(args ? `${command()} ${args}` : command());

/**
 * A spinner on a terminal; where nobody watches, only what came of it. The message ends in "…"
 * ("Checking status…"); clack animates its own dots in its place.
 */
export function busy(message: string) {
  if (!process.stdout.isTTY) {
    return { stop: (text: string) => p.log.step(text), fail: (text: string) => p.log.warn(text) };
  }
  const spinner = p.spinner();
  spinner.start(message.replace(/…$/, ""));
  return {
    stop: (text: string) => spinner.stop(text),
    fail: (text: string) => spinner.error(text),
  };
}
