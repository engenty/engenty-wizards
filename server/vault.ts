import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { seal, unseal } from "./crypto.js";
import { env } from "./env.js";

const run = promisify(execFile);

/**
 * Secrets of a runtime that runs alone: the keys the person entered and the linked account's
 * refresh token. In the desktop app (`SECRETS=keychain`) they live in the macOS Keychain, never
 * in the database; elsewhere in an encrypted file in the data folder.
 */
const SERVICE = "engenty-wizards";
const keychain = process.env.SECRETS === "keychain" && process.platform === "darwin";
const file = join(env.dataDir, "vault");

function readFileVault(): Record<string, string> {
  if (!existsSync(file)) {
    return {};
  }
  return unseal<Record<string, string>>(readFileSync(file, "utf8").trim()) ?? {};
}

function writeFileVault(all: Record<string, string>) {
  writeFileSync(file, seal(all), { mode: 0o600 });
}

export async function vaultGet(name: string): Promise<string | null> {
  if (!keychain) {
    return readFileVault()[name] ?? null;
  }
  try {
    const { stdout } = await run("security", [
      "find-generic-password",
      "-s",
      SERVICE,
      "-a",
      name,
      "-w",
    ]);
    return stdout.replace(/\n$/, "") || null;
  } catch {
    return null;
  }
}

export async function vaultSet(name: string, value: string): Promise<void> {
  if (!keychain) {
    writeFileVault({ ...readFileVault(), [name]: value });
    return;
  }
  await run("security", ["add-generic-password", "-U", "-s", SERVICE, "-a", name, "-w", value]);
}

export async function vaultDelete(name: string): Promise<void> {
  if (!keychain) {
    const all = readFileVault();
    delete all[name];
    writeFileVault(all);
    return;
  }
  await run("security", ["delete-generic-password", "-s", SERVICE, "-a", name]).catch(
    () => undefined,
  );
}
