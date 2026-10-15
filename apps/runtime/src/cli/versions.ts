import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import type { Layout } from "./home.js";

/**
 * The runtimes of an install made by install.sh, one folder per version, side by side:
 *
 *   runtime/<version>/     an npm prefix: node_modules/wizards, package.json, package-lock.json
 *   runtime/current        → <version>, the one `bin/wizards` starts
 *   runtime/node_modules   → current/node_modules, for commands written before the versions
 *
 * Up to 0.6.2 `runtime/` itself was the prefix; `switchTo` moves such an install into its
 * version folder first. A process keeps the files of the version it started with.
 */

const VERSION = /^\d+\.\d+\.\d+$/;

export const runtimeDir = (paths: Layout, version: string) => join(paths.runtime, version);
const currentLink = (paths: Layout) => join(paths.runtime, "current");
const modules = (paths: Layout) => join(paths.runtime, "node_modules");

/** The version of the package `wizards` in an npm prefix; null when there is none. */
export function versionIn(prefix: string): string | null {
  try {
    const file = join(prefix, "node_modules", "wizards", "package.json");
    const { version } = JSON.parse(readFileSync(file, "utf8")) as { version?: unknown };
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}

const isLink = (path: string) => {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
};

/** The version `bin/wizards` starts; null without a runtime. */
export function currentVersion(paths: Layout): string | null {
  if (isLink(currentLink(paths))) {
    return versionIn(join(paths.runtime, readlinkSync(currentLink(paths))));
  }
  return versionIn(paths.runtime);
}

/** The version folders there are, each with a complete package in it. */
export function installedVersions(paths: Layout): string[] {
  try {
    return readdirSync(paths.runtime)
      .filter((name) => VERSION.test(name) && versionIn(join(paths.runtime, name)) === name)
      .sort();
  } catch {
    return [];
  }
}

/** Points `link` at `target` in one step: a new link renamed over the old one. */
function link(target: string, path: string) {
  const tmp = `${path}.${process.pid}.tmp`;
  rmSync(tmp, { force: true });
  symlinkSync(target, tmp);
  renameSync(tmp, path);
}

/** Moves a runtime from before the version folders into `runtime/<version>/`. */
function adoptLegacy(paths: Layout) {
  const version = versionIn(paths.runtime);
  if (isLink(modules(paths)) || !version) {
    return;
  }
  const into = runtimeDir(paths, version);
  rmSync(into, { recursive: true, force: true });
  mkdirSync(into, { recursive: true });
  for (const name of ["node_modules", "package.json", "package-lock.json"]) {
    if (existsSync(join(paths.runtime, name))) {
      renameSync(join(paths.runtime, name), join(into, name));
    }
  }
  link(version, currentLink(paths));
}

/** Makes `version` the one `bin/wizards` starts from now on. */
export function switchTo(paths: Layout, version: string) {
  if (versionIn(runtimeDir(paths, version)) !== version) {
    throw new Error(`${runtimeDir(paths, version)} holds no complete runtime ${version}.`);
  }
  adoptLegacy(paths);
  link(version, currentLink(paths));
  link(join("current", "node_modules"), modules(paths));
}

/** Deletes the version folders other than `keep` and the current one; returns what went. */
export function prune(paths: Layout, keep: string[]): string[] {
  const current = currentVersion(paths);
  const stale = installedVersions(paths).filter((v) => v !== current && !keep.includes(v));
  for (const version of stale) {
    rmSync(runtimeDir(paths, version), { recursive: true, force: true });
  }
  return stale;
}

/** Puts an npm prefix installed elsewhere into its version folder (never the current one). */
export function promote(paths: Layout, staged: string, version: string) {
  if (versionIn(staged) !== version) {
    throw new Error(`The download holds version ${versionIn(staged) ?? "none"}, not ${version}.`);
  }
  if (currentVersion(paths) === version) {
    rmSync(staged, { recursive: true, force: true });
    return;
  }
  rmSync(runtimeDir(paths, version), { recursive: true, force: true });
  renameSync(staged, runtimeDir(paths, version));
}
