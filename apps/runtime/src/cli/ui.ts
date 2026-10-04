import { homedir } from "node:os";
import { styleText } from "node:util";

const colours = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

/** The name on engenty's orange. */
export const badge = (text: string) =>
  colours ? `\x1b[48;2;224;83;27m\x1b[97m\x1b[1m ${text} \x1b[0m` : text;

export const dim = (text: string) => styleText("dim", text);
export const cyan = (text: string) => styleText("cyan", text);
export const ok = styleText("green", "✓");
export const no = styleText("yellow", "–");
export const bad = styleText("red", "✗");

/** A path as the person would write it. */
export const tilde = (path: string) =>
  path.startsWith(homedir()) ? `~${path.slice(homedir().length)}` : path;
