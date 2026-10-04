import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { installedByScript, isCheckout, type Layout } from "./home.js";
import { runningRuntime, settings } from "./start.js";
import { cyan } from "./ui.js";

/** The installer this install was made with; it also updates one. */
const INSTALLER = "https://engenty.ai/wizards.sh";

async function installer(into: string): Promise<string> {
  const source = process.env.ENGENTY_WIZARDS_INSTALLER?.trim() || INSTALLER;
  if (!/^https?:\/\//.test(source)) {
    return source;
  }
  const response = await fetch(source);
  const text = response.ok ? await response.text() : "";
  // The address answers with the studio's page while a server has no installer yet.
  if (!text.startsWith("#!")) {
    throw new Error(`${source} did not answer with the installer.`);
  }
  const file = join(into, "wizards.sh");
  writeFileSync(file, text, { mode: 0o700 });
  return file;
}

/**
 * Brings an install made by wizards.sh to the newest version by running the installer again
 * without its questions: Node, the runtime and the command.
 */
export async function update(paths: Layout): Promise<number> {
  if (!installedByScript(paths)) {
    console.log(
      isCheckout()
        ? `This copy is a checkout. The newest version: ${cyan("git pull && pnpm install && pnpm build")}`
        : `This copy runs from npm. The newest version: ${cyan("npx engenty-wizards@latest")}`,
    );
    return 0;
  }
  const tmp = mkdtempSync(join(paths.home, "update-"));
  try {
    const script = await installer(tmp);
    const code = await new Promise<number>((done) => {
      const child = spawn("bash", [script, "--no-setup"], { stdio: "inherit" });
      child.on("error", () => done(127));
      child.on("exit", (exit) => done(exit ?? 1));
    });
    if (code !== 0) {
      return code;
    }
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  if (await runningRuntime(settings(paths).dataDir)) {
    console.log(
      `  The runtime that is running is still the old one. Restart it: ${cyan("engenty-wizards stop")}, then ${cyan("engenty-wizards")}.`,
    );
  }
  return 0;
}
