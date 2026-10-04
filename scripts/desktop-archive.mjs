// Builds the Mac app and packs it the way the installer fetches it: a .tar.gz of the bundle and
// its checksum, named engenty-wizards-<version>-mac-<arch>.tar.gz. The app holds no runtime; it
// starts the one in ~/.engenty/wizards and installs it on its first start (apps/desktop).
//
//   node scripts/desktop-archive.mjs [--skip-build] [--debug]
//
// Out: dist/desktop/. Attach both files to the GitHub release `v<version>`: `engenty-wizards app`
// and the setup fetch them from there (apps/runtime/src/cli/desktop.ts).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const desktop = join(root, "apps", "desktop");
const outDir = join(root, "dist", "desktop");
const args = process.argv.slice(2);
const profile = args.includes("--debug") ? "debug" : "release";

if (process.platform !== "darwin") {
  throw new Error("The Mac app is built on macOS.");
}
if (!args.includes("--skip-build")) {
  // CI=true keeps the bundler from scripting Finder.
  execFileSync(
    "pnpm",
    ["tauri", "build", ...(profile === "debug" ? ["--debug"] : []), "--bundles", "app"],
    { cwd: desktop, stdio: "inherit", env: { ...process.env, CI: "true" } },
  );
}
const bundles = join(desktop, "src-tauri", "target", profile, "bundle", "macos");
const name = "engenty wizards.app";
if (!existsSync(join(bundles, name))) {
  throw new Error(`${join(bundles, name)} is missing — run without --skip-build.`);
}
// The signature seals the bundle; an archive of a broken one is of no use.
execFileSync("codesign", ["--verify", "--deep", "--strict", join(bundles, name)], { stdio: "inherit" });

const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
mkdirSync(outDir, { recursive: true });
const archive = join(outDir, `engenty-wizards-${version}-mac-${process.arch}.tar.gz`);
execFileSync("tar", ["-czf", archive, "-C", bundles, name], { stdio: "inherit" });
const digest = createHash("sha256").update(readFileSync(archive)).digest("hex");
writeFileSync(`${archive}.sha256`, `${digest}  ${archive.split("/").pop()}\n`);
console.log(`
${archive}
  ${(statSync(archive).size / 1024 / 1024).toFixed(1)} MB, sha256 ${digest}
`);
