import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { Layout } from "./home.js";

const run = promisify(execFile);

/**
 * The Mac app is a window on this install: it starts the runtime in the home folder and shows
 * the studio. It comes as an archive from the release, fetched by this command — a file that no
 * browser downloaded carries no quarantine flag, so macOS opens it without a Developer ID.
 */
export const APP_BUNDLE = "engenty wizards.app";
const APP_IDENTIFIER = "com.engenty.wizards";
const APP_PROCESS = "engenty-wizards";
const RELEASES = "https://github.com/engenty/engenty-wizards/releases/download";

export function appArchiveUrl(version: string, arch: string = process.arch): string {
  return `${RELEASES}/v${version}/engenty-wizards-${version}-mac-${arch}.tar.gz`;
}

/** Where the app may be: /Applications, else the person's own. `ENGENTY_WIZARDS_APP_DIR` names another folder. */
const appFolders = () => {
  const given = process.env.ENGENTY_WIZARDS_APP_DIR?.trim();
  return given ? [given] : ["/Applications", join(homedir(), "Applications")];
};

/** Where the app is installed, if it is. */
export function findApp(): string | null {
  return (
    appFolders()
      .map((dir) => join(dir, APP_BUNDLE))
      .find((app) => existsSync(app)) ?? null
  );
}

async function plistValue(app: string, key: string): Promise<string | null> {
  try {
    const { stdout } = await run("/usr/libexec/PlistBuddy", [
      "-c",
      `Print :${key}`,
      join(app, "Contents", "Info.plist"),
    ]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export const appVersion = (app: string) => plistValue(app, "CFBundleShortVersionString");

async function appIsRunning(): Promise<boolean> {
  try {
    await run("pgrep", ["-x", APP_PROCESS]);
    return true;
  } catch {
    return false;
  }
}

/** A release archive with its checksum next to it (`<url>.sha256`), or a file on this machine. */
async function fetchArchive(source: string, into: string): Promise<string> {
  if (!/^https?:\/\//.test(source)) {
    if (!existsSync(source)) {
      throw new Error(`${source} does not exist.`);
    }
    return source;
  }
  const response = await fetch(source);
  if (response.status === 404) {
    throw new Error("There is no Mac app for this version and this kind of Mac yet.");
  }
  if (!response.ok) {
    throw new Error(`${source}: ${response.status} ${response.statusText}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const sums = await fetch(`${source}.sha256`);
  if (!sums.ok) {
    throw new Error(`The checksum of the archive is missing (${source}.sha256).`);
  }
  const expected = (await sums.text()).trim().split(/\s+/)[0];
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (expected !== actual) {
    throw new Error("The archive does not match its checksum.");
  }
  const file = join(into, "app.tar.gz");
  writeFileSync(file, bytes);
  return file;
}

/**
 * Puts the app into /Applications (or ~/Applications when that is not writable) and returns
 * where it is. An older copy of ours is replaced; anything else of that name is left alone.
 */
export async function installApp(paths: Layout, version: string): Promise<string> {
  if (process.platform !== "darwin") {
    throw new Error("The desktop app exists for macOS only.");
  }
  const source = process.env.ENGENTY_WIZARDS_APP?.trim() || appArchiveUrl(version);
  mkdirSync(paths.home, { recursive: true });
  const tmp = mkdtempSync(join(paths.home, "app-"));
  try {
    const archive = await fetchArchive(source, tmp);
    await run("tar", ["-xzf", archive, "-C", tmp]);
    const unpacked = join(tmp, APP_BUNDLE);
    if ((await plistValue(unpacked, "CFBundleIdentifier")) !== APP_IDENTIFIER) {
      throw new Error("The archive does not hold the engenty wizards app.");
    }
    // The signature seals the bundle: an archive that lost a file on the way fails here.
    await run("codesign", ["--verify", "--deep", "--strict", unpacked]).catch(() => {
      throw new Error("The app's signature does not match its files.");
    });

    const existing = findApp();
    if (existing) {
      if ((await plistValue(existing, "CFBundleIdentifier")) !== APP_IDENTIFIER) {
        throw new Error(`${existing} is not this app; it was left as it is.`);
      }
      if (await appIsRunning()) {
        throw new Error("The app is open. Quit it, then run this again.");
      }
    }
    const folder = existing
      ? dirname(existing)
      : appFolders().find((dir) => {
          try {
            mkdirSync(dir, { recursive: true });
            accessSync(dir, constants.W_OK);
            return true;
          } catch {
            return false;
          }
        });
    if (!folder) {
      throw new Error("Neither /Applications nor ~/Applications can be written to.");
    }
    const target = join(folder, APP_BUNDLE);
    rmSync(target, { recursive: true, force: true });
    // ditto copies a bundle as it is, across volumes too.
    await run("ditto", [unpacked, target]);
    return target;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export async function openApp(app: string) {
  await run("open", [app]);
}

/** What `status` says about the app. */
export async function appState(): Promise<{ path: string; version: string | null } | null> {
  const path = process.platform === "darwin" ? findApp() : null;
  return path ? { path, version: await appVersion(path) } : null;
}
