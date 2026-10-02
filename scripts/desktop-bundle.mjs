// Assembles what the desktop app brings along: the runtime (built server, built SPA, the shared
// package, plugin template, production node_modules) in apps/desktop/src-tauri/resources/server/
// and a Node binary in apps/desktop/src-tauri/binaries/node-<target-triple>. Run it before
// `tauri build`:
//
//   node scripts/desktop-bundle.mjs [--target aarch64-apple-darwin] [--node /path/to/node]
//                                   [--skip-build]
//
// --target      the Rust target triple the app is built for (default: this machine)
// --node        the Node binary to bring along (default: the Node running this script).
//               CI fetches the official one for the target instead:
//               https://nodejs.org/dist/v<version>/node-v<version>-darwin-<arm64|x64>.tar.gz
//               (verify against SHASUMS256.txt), unpack, pass bin/node here.
// --skip-build  reuse the dist/ folders of the checkout instead of building
//
// The folder keeps the checkout's layout (apps/runtime/dist, apps/web/dist, plugin/), so the
// runtime finds the SPA and the plugin template the same way everywhere.
//
// With APPLE_SIGNING_IDENTITY set, every Mach-O file in the runtime folder (native addons) is
// signed with it, hardened runtime and timestamp included — notarization asks for that.
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const tauriDir = join(root, "apps", "desktop", "src-tauri");
const out = join(tauriDir, "resources", "server");

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};

const HOST_TRIPLES = {
  "darwin-arm64": "aarch64-apple-darwin",
  "darwin-x64": "x86_64-apple-darwin",
  "linux-x64": "x86_64-unknown-linux-gnu",
  "linux-arm64": "aarch64-unknown-linux-gnu",
  "win32-x64": "x86_64-pc-windows-msvc",
};
const target = option("target") ?? HOST_TRIPLES[`${process.platform}-${process.arch}`];
if (!target) {
  throw new Error(`No target triple known for ${process.platform}-${process.arch}; pass --target.`);
}
const targetCpu = target.startsWith("aarch64") ? "arm64" : "x64";
const targetOs = target.includes("darwin") ? "darwin" : target.includes("windows") ? "win32" : "linux";
const nodeBinary = resolve(option("node") ?? process.execPath);

const run = (cmd, cmdArgs, cwd = root) => {
  console.log(`$ ${cmd} ${cmdArgs.join(" ")}`);
  execFileSync(cmd, cmdArgs, { cwd, stdio: "inherit" });
};

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
    } else {
      yield path;
    }
  }
}

const sizeOf = (path) => {
  const stat = lstatSync(path);
  if (!stat.isDirectory()) {
    return stat.size;
  }
  let total = 0;
  for (const file of walk(path)) {
    total += lstatSync(file).size;
  }
  return total;
};
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// --- 1. the runtime itself -------------------------------------------------------------
const BUILT = ["apps/runtime/dist", "apps/web/dist", "packages/shared/dist"];
if (flag("skip-build")) {
  for (const dir of BUILT) {
    if (!existsSync(join(root, dir))) {
      throw new Error(`${dir}/ is missing — run without --skip-build.`);
    }
  }
} else {
  // tsc leaves files of deleted sources behind: build into empty folders.
  for (const dir of BUILT) {
    rmSync(join(root, dir), { recursive: true, force: true });
  }
  run("pnpm", ["-r", "build"]);
}
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const dir of ["apps/runtime/dist", "apps/web/dist", "plugin"]) {
  cpSync(join(root, dir), join(out, dir), { recursive: true });
}

// --- 2. production node_modules ----------------------------------------------------------
// The runtime's dependencies; a workspace package comes along as its built files, its own
// dependencies join the list. The agentOS sandbox (a devDependency, loaded only with
// SANDBOX=agentos) weighs over a gigabyte and stays out.
const readJson = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const pkg = readJson("package.json");
const dependencies = {};
const workspace = [];
const collect = (dir) => {
  for (const [name, range] of Object.entries(readJson(`${dir}/package.json`).dependencies ?? {})) {
    if (range.startsWith("workspace:")) {
      const from = `packages/${name.split("/").pop()}`;
      workspace.push([name, from]);
      collect(from);
    } else {
      dependencies[name] = range;
    }
  }
};
collect("apps/runtime");
writeFileSync(
  join(out, "package.json"),
  `${JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      license: pkg.license,
      private: true,
      type: "module",
      dependencies,
      pnpm: { supportedArchitectures: { os: [targetOs], cpu: [targetCpu] } },
    },
    null,
    2,
  )}\n`,
);
// The checkout's lockfile pins every version; a flat node_modules has no symlinks, which the
// app bundle and code signing need.
cpSync(join(root, "pnpm-lock.yaml"), join(out, "pnpm-lock.yaml"));
writeFileSync(join(out, ".npmrc"), "node-linker=hoisted\n");
run(
  "pnpm",
  ["install", "--prod", "--no-frozen-lockfile", "--ignore-workspace", "--ignore-scripts"],
  out,
);
for (const name of [".npmrc", "pnpm-lock.yaml"]) {
  rmSync(join(out, name), { force: true });
}
for (const [name, from] of workspace) {
  const to = join(out, "node_modules", name);
  mkdirSync(to, { recursive: true });
  cpSync(join(root, from, "package.json"), join(to, "package.json"));
  cpSync(join(root, from, "dist"), join(to, "dist"), { recursive: true });
}

const native = join(out, "node_modules", "@libsql", `${targetOs}-${targetCpu}`);
if (targetOs !== "linux" && !existsSync(native)) {
  throw new Error(`The libSQL native binding for ${targetOs}-${targetCpu} is not in the bundle.`);
}

// --- 3. prune -----------------------------------------------------------------------------
// Nothing the running server reads: docs, typings, source maps, sources next to builds, bins.
const modules = join(out, "node_modules");
const before = sizeOf(modules);
const DROP_DIRS = new Set([".bin", ".github", ".vscode", "docs", "example", "examples"]);
const DROP_FILE = /(\.map|\.d\.ts|\.d\.mts|\.d\.cts|\.tsbuildinfo|\.md|\.markdown|\.flow)$/i;
const KEEP_FILE = /^(license|licence|notice)/i;
function prune(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      rmSync(path, { force: true });
    } else if (entry.isDirectory()) {
      if (DROP_DIRS.has(entry.name)) {
        rmSync(path, { recursive: true, force: true });
      } else if (entry.name === "prebuilds") {
        // Native prebuilds for every platform: keep the target's.
        for (const platform of readdirSync(path)) {
          if (platform !== `${targetOs}-${targetCpu}`) {
            rmSync(join(path, platform), { recursive: true, force: true });
          }
        }
      } else {
        prune(path);
      }
    } else if (DROP_FILE.test(entry.name) && !KEEP_FILE.test(entry.name)) {
      rmSync(path, { force: true });
    }
  }
}
prune(modules);
rmSync(join(modules, ".modules.yaml"), { force: true });
rmSync(join(modules, ".pnpm-workspace-state-v1.json"), { force: true });

// --- 4. Node ------------------------------------------------------------------------------
const binaries = join(tauriDir, "binaries");
mkdirSync(binaries, { recursive: true });
const nodeTarget = join(binaries, `node-${target}${targetOs === "win32" ? ".exe" : ""}`);
rmSync(nodeTarget, { force: true });
cpSync(nodeBinary, nodeTarget);
chmodSync(nodeTarget, 0o755);

// --- 5. Mach-O files in the runtime folder (native addons) -------------------------------------
const MACHO = new Set(["feedfacf", "cffaedfe", "feedface", "cefaedfe", "cafebabe", "bebafeca"]);
function isMachO(file) {
  if (statSync(file).size < 4) {
    return false;
  }
  const fd = openSync(file, "r");
  const head = Buffer.alloc(4);
  readSync(fd, head, 0, 4, 0);
  closeSync(fd);
  return MACHO.has(head.toString("hex")) && !file.endsWith(".class");
}
const machO = targetOs === "darwin" ? [...walk(out)].filter(isMachO) : [];
const identity = process.env.APPLE_SIGNING_IDENTITY;
if (identity && identity !== "-") {
  for (const file of machO) {
    run("codesign", ["--force", "--options", "runtime", "--timestamp", "--sign", identity, file]);
  }
}

// --- report -------------------------------------------------------------------------------
const files = [...walk(out)].length;
console.log(`
desktop bundle for ${target}
  runtime        ${mb(sizeOf(out))} in ${files} files  (${dirname(out)}/server)
  node_modules   ${mb(sizeOf(modules))} (${mb(before)} before pruning), ${Object.keys(dependencies).length} dependencies
  node           ${mb(sizeOf(nodeTarget))}  (${nodeBinary})
  native code    ${machO.length ? machO.map((f) => f.slice(out.length + 1)).join(", ") : "none"}${
    identity && identity !== "-" ? `\n  signed with    ${identity}` : ""
  }
`);
