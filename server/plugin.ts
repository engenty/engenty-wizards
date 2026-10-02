import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import { env } from "./env.js";

/**
 * The Claude Code plugin for this deployment: the `plugin/` folder with this server's URL filled
 * in, served as a marketplace (`url` source) whose one plugin is a zip (`archive` source). So
 * every deployment hands out its own plugin and no domain is baked into the repo.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = [resolve(here, ".."), resolve(here, "../..")].find((d) =>
  existsSync(join(d, "plugin")),
);

export const PLUGIN_NAME = "engenty-wizards";
export const MARKETPLACE_NAME = "engenty";
export const pluginBase = `${env.appUrl}/api/claude-plugin`;

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((e) => (e.isDirectory() ? filesUnder(join(dir, e.name)) : [join(dir, e.name)])),
  );
  return nested.flat();
}

let built: Promise<{ zip: Uint8Array; sha256: string; version: string }> | null = null;

export function pluginArchive() {
  built ??= (async () => {
    if (!root) {
      throw new Error("plugin/ folder missing");
    }
    const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    const dir = join(root, "plugin");
    const files: Record<string, Uint8Array> = {};
    for (const path of (await filesUnder(dir)).sort()) {
      const text = (await readFile(path, "utf8"))
        .replaceAll("{{APP_URL}}", env.appUrl)
        .replaceAll("{{VERSION}}", version);
      // Fixed timestamps keep the archive, and so its sha256, stable across restarts.
      files[relative(dir, path)] = new TextEncoder().encode(text);
    }
    const zip = zipSync(files, { level: 9, mtime: new Date("2026-01-01T00:00:00Z") });
    return { zip, sha256: createHash("sha256").update(zip).digest("hex"), version };
  })();
  return built;
}

export async function pluginMarketplace() {
  const { sha256, version } = await pluginArchive();
  return {
    name: MARKETPLACE_NAME,
    owner: { name: "engenty" },
    description: "engenty wizards for Claude Code",
    plugins: [
      {
        name: PLUGIN_NAME,
        description:
          "Build page-by-page AI wizards that people open on a shared link — designed, tested and published from Claude Code.",
        version,
        source: { source: "archive", url: `${pluginBase}/${PLUGIN_NAME}.zip`, sha256 },
      },
    ],
  };
}
