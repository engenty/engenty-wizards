import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { present } from "../src/cli/autostart.js";
import type { App } from "../src/cli/connect.js";
import { layout } from "../src/cli/home.js";
import {
  type ProcessEntry,
  selfAndAncestors,
  stopProcesses,
  type WizardsProcess,
  wizardsProcesses,
} from "../src/cli/processes.js";
import {
  makePlan,
  parseUninstall,
  readDataCounts,
  type UninstallSystem,
  uninstall,
} from "../src/cli/uninstall.js";

// Every test works in a home folder of its own under the temp folder, never the real one: the
// system the uninstall talks to (apps, processes, launchctl, the Keychain) is a stand-in.

let user: string;
let paths: ReturnType<typeof layout>;
beforeEach(() => {
  user = mkdtempSync(join(tmpdir(), "wizards-uninstall-"));
  paths = layout(join(user, ".engenty", "wizards"));
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(user, { recursive: true, force: true });
});

const touch = (file: string, text = "x") => {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, text);
};

/** An install as install.sh leaves it, with a login item, the link and some data. */
function installed() {
  touch(join(paths.bin, "wizards"), "#!/bin/sh\n");
  touch(join(paths.runtime, "node_modules", "wizards", "package.json"), "{}");
  touch(join(paths.tools, "node", "bin", "node"));
  touch(join(paths.logs, "runtime.log"));
  touch(paths.installFile, "{}");
  touch(paths.envFile, "API_PORT=8900\n");
  mkdirSync(paths.plugins, { recursive: true });
  touch(join(paths.data, "secret"));
  touch(join(user, "Library", "LaunchAgents", "com.engenty.wizards.login.plist"), "<plist/>");
  mkdirSync(join(user, ".local", "bin"), { recursive: true });
  symlinkSync(join(paths.bin, "wizards"), join(user, ".local", "bin", "wizards"));
}

function fakeApp(id: string, connected: boolean, works = true): App & { on: boolean } {
  const app = {
    id,
    name: id,
    widgets: false,
    where: join(user, `.${id}.json`),
    on: connected,
    installed: () => true,
    connected: async () => app.on,
    connect: async () => ({ ok: true as const, message: "" }),
    disconnect: async () => {
      if (!works) {
        return { ok: false as const, message: `${id} is running` };
      }
      app.on = false;
      return { ok: true as const, message: "removed" };
    },
  };
  return app;
}

function fakeSystem(
  over: Partial<UninstallSystem> & { running?: WizardsProcess[]; stubborn?: number[] } = {},
) {
  const running = over.running ?? [];
  const calls: string[] = [];
  let keychain = true;
  const appList = [fakeApp("cursor", true), fakeApp("codex", false)];
  const system: UninstallSystem = {
    userHome: user,
    platform: "darwin",
    env: {},
    interactive: false,
    apps: () => appList,
    processes: () => running,
    stop: async (pids) => {
      calls.push(`stop ${pids.join(",")}`);
      const left = pids.filter((pid) => over.stubborn?.includes(pid));
      running.splice(0, running.length, ...running.filter((p) => left.includes(p.pid)));
      return left;
    },
    unloadLoginItem: async () => {
      calls.push("bootout");
    },
    removeUnit: async (file) => {
      calls.push("unit");
      rmSync(file, { force: true });
    },
    keychain: {
      present: async () => keychain,
      clear: async () => {
        calls.push("keychain");
        keychain = false;
      },
    },
    sizeOf: () => 2 * 1024 * 1024,
    readData: async () => ({ wizards: 3, spaces: 2, onlyHere: 1, connections: 1 }),
    backup: async (parts, file) => {
      calls.push(`backup ${file} ${parts.length}`);
      writeFileSync(file, "tar");
    },
    now: () => new Date("2026-10-15T12:00:00Z"),
    ...over,
  };
  return { system, calls, apps: appList };
}

const proc = (pid: number, kind: WizardsProcess["kind"]): WizardsProcess => ({
  pid,
  kind,
  command: `node ${paths.home}/runtime/node_modules/wizards/bin/wizards.mjs ${kind}`,
});

describe("the plan of an uninstall", () => {
  it("names the apps, the login item, the processes, the program, the link and the data", async () => {
    installed();
    const { system } = fakeSystem({ running: [proc(11, "runtime"), proc(12, "mcp")] });
    const plan = await makePlan(paths, system);
    expect(plan.apps.map((app) => app.id)).toEqual(["cursor"]);
    expect(plan.loginItem).toBe(
      join(user, "Library", "LaunchAgents", "com.engenty.wizards.login.plist"),
    );
    expect(plan.processes.map((p) => p.pid)).toEqual([11, 12]);
    expect(plan.links).toEqual([join(user, ".local", "bin", "wizards")]);
    // An empty plugins folder is program; the settings go with the data.
    expect(plan.program.sort()).toEqual(
      [paths.bin, paths.runtime, paths.tools, paths.logs, paths.installFile, paths.plugins].sort(),
    );
    expect(plan.data?.dir).toBe(paths.data);
    expect(plan.data?.extras).toEqual([paths.envFile]);
    expect(plan.data?.keychain).toBe(true);
  });

  it("finds the login item on Linux as a systemd user service", async () => {
    installed();
    const unit = join(user, ".config", "systemd", "user", "engenty-wizards.service");
    touch(unit, "[Unit]\n");
    const { system } = fakeSystem({ platform: "linux" });
    expect((await makePlan(paths, system)).loginItem).toBe(unit);
  });

  it("leaves a link that isn't the install's alone", async () => {
    mkdirSync(join(user, ".local", "bin"), { recursive: true });
    symlinkSync("/usr/bin/true", join(user, ".local", "bin", "wizards"));
    const { system } = fakeSystem();
    const plan = await makePlan(paths, system);
    expect(plan.links).toEqual([]);
    expect(plan.install).toBeNull();
  });
});

describe("wizards uninstall", () => {
  it("refuses without a terminal unless --yes is given", async () => {
    installed();
    const { system } = fakeSystem();
    const code = await uninstall(
      paths,
      { dryRun: false, yes: false, deleteData: false, backup: false },
      system,
    );
    expect(code).toBe(2);
    expect(existsSync(paths.bin)).toBe(true);
  });

  it("changes nothing with --dry-run", async () => {
    installed();
    const { system, calls, apps } = fakeSystem({ running: [proc(11, "start")] });
    const code = await uninstall(
      paths,
      { dryRun: true, yes: false, deleteData: false, backup: false },
      system,
    );
    expect(code).toBe(0);
    expect(calls).toEqual([]);
    expect(apps[0].on).toBe(true);
    expect(existsSync(paths.runtime)).toBe(true);
    expect(existsSync(join(user, ".local", "bin", "wizards"))).toBe(true);
  });

  it("with --yes takes the program away and keeps the data where a reinstall finds it", async () => {
    installed();
    const { system, calls, apps } = fakeSystem({
      running: [proc(11, "runtime"), proc(12, "start"), proc(13, "mcp")],
    });
    const code = await uninstall(
      paths,
      { dryRun: false, yes: true, deleteData: false, backup: false },
      system,
    );
    expect(code).toBe(0);
    expect(apps[0].on).toBe(false);
    expect(calls).toContain("bootout");
    expect(calls).toContain("stop 11,12,13");
    expect(calls).not.toContain("keychain");
    expect(present(join(user, "Library", "LaunchAgents", "com.engenty.wizards.login.plist"))).toBe(
      false,
    );
    expect(existsSync(join(user, ".local", "bin", "wizards"))).toBe(false);
    for (const gone of [paths.bin, paths.runtime, paths.tools, paths.logs, paths.installFile]) {
      expect(existsSync(gone)).toBe(false);
    }
    expect(existsSync(join(paths.data, "secret"))).toBe(true);
    expect(readFileSync(paths.envFile, "utf8")).toContain("API_PORT");
  });

  it("deletes the data only with --yes --delete-data, after a backup with --backup", async () => {
    installed();
    const { system, calls } = fakeSystem();
    const code = await uninstall(
      paths,
      { dryRun: false, yes: true, deleteData: true, backup: true },
      system,
    );
    expect(code).toBe(0);
    const backup = join(user, "engenty-wizards-data-2026-10-15.tar.gz");
    // The data folder and the settings that go with it.
    expect(calls).toContain(`backup ${backup} 2`);
    expect(existsSync(backup)).toBe(true);
    expect(calls).toContain("keychain");
    // Nothing is left, not even the empty ~/.engenty.
    expect(existsSync(join(user, ".engenty"))).toBe(false);
  });

  it("keeps the data when the backup fails", async () => {
    installed();
    const { system } = fakeSystem({
      backup: async () => {
        throw new Error("disk full");
      },
    });
    const code = await uninstall(
      paths,
      { dryRun: false, yes: true, deleteData: true, backup: true },
      system,
    );
    expect(code).toBe(1);
    expect(existsSync(join(paths.data, "secret"))).toBe(true);
    expect(existsSync(paths.runtime)).toBe(false);
  });

  it("fails when something is left: an app that can't be changed, a process that won't stop", async () => {
    installed();
    const { system } = fakeSystem({ running: [proc(21, "mcp")], stubborn: [21] });
    system.apps = () => [fakeApp("claude-desktop", true, false)];
    const code = await uninstall(
      paths,
      { dryRun: false, yes: true, deleteData: false, backup: false },
      system,
    );
    expect(code).toBe(1);
    const said = vi.mocked(console.log).mock.calls.flat().join("\n");
    expect(said).toContain("npx wizards disconnect claude-desktop");
    expect(said).toContain("kill -9 21");
  });

  it("says there is nothing to do on a computer without it", async () => {
    const { system, calls } = fakeSystem();
    system.apps = () => [];
    const code = await uninstall(
      paths,
      { dryRun: false, yes: true, deleteData: false, backup: false },
      system,
    );
    expect(code).toBe(0);
    expect(calls).toEqual([]);
    expect(existsSync(join(user, ".engenty"))).toBe(false);
  });

  it("reads its options", () => {
    expect(parseUninstall(["uninstall", "--yes", "--delete-data"])).toEqual({
      dryRun: false,
      yes: true,
      deleteData: true,
      backup: false,
    });
    expect(parseUninstall(["--dry-run"])).toMatchObject({ dryRun: true });
    expect(parseUninstall(["--force"])).toMatch(/Unknown option --force/);
  });
});

describe("what the data folder holds", () => {
  it("counts wizards, spaces, connected accounts and the wizards only on this computer", async () => {
    mkdirSync(join(paths.data, "tenants"), { recursive: true });
    const tenant = createClient({ url: `file:${join(paths.data, "tenants", "local.db")}` });
    await tenant.executeMultiple(`
      CREATE TABLE project (id TEXT PRIMARY KEY);
      CREATE TABLE wizard (id TEXT PRIMARY KEY);
      CREATE TABLE store_secret (id TEXT PRIMARY KEY);
      INSERT INTO project VALUES ('p1'), ('p2');
      INSERT INTO wizard VALUES ('w1'), ('w2'), ('w3');
      INSERT INTO store_secret VALUES ('s1');
    `);
    tenant.close();
    const control = createClient({ url: `file:${join(paths.data, "control.db")}` });
    await control.executeMultiple(`
      CREATE TABLE setting (key TEXT PRIMARY KEY, value TEXT);
      INSERT INTO setting VALUES ('cloud:w1', '{"copy":{"version":1},"error":null}');
      INSERT INTO setting VALUES ('cloud:w2', '{"copy":null,"error":{"message":"x"}}');
    `);
    control.close();
    expect(await readDataCounts(paths.data)).toEqual({
      wizards: 3,
      spaces: 2,
      onlyHere: 2,
      connections: 1,
    });
  });

  it("is empty for a data folder without databases", async () => {
    mkdirSync(paths.data, { recursive: true });
    expect(await readDataCounts(paths.data)).toEqual({
      wizards: 0,
      spaces: 0,
      onlyHere: 0,
      connections: 0,
    });
  });
});

describe("the processes of engenty wizards", () => {
  const home = "/Users/x/.engenty/wizards";
  const list: ProcessEntry[] = [
    { pid: 1, ppid: 0, command: "/sbin/launchd" },
    { pid: 10, ppid: 1, command: `${home}/tools/node/bin/node ${home}/runtime/node_modules/wizards/bin/wizards.mjs start --no-open` },
    { pid: 11, ppid: 10, command: `${home}/tools/node-v24.14.0/bin/node ${home}/runtime/node_modules/wizards/apps/runtime/dist/index.js` },
    { pid: 12, ppid: 1, command: `${home}/tools/node/bin/node ${home}/runtime/node_modules/wizards/bin/wizards.mjs mcp` },
    { pid: 20, ppid: 1, command: "npm exec wizards uninstall" },
    { pid: 21, ppid: 20, command: "node /Users/x/.npm/_npx/aa98/node_modules/.bin/wizards uninstall" },
    { pid: 30, ppid: 1, command: "node /Users/x/code/wizards/bin/wizards.mjs start" },
    { pid: 31, ppid: 1, command: "vim /Users/x/notes/wizards.md" },
    { pid: 40, ppid: 1, command: "npm exec wizards" },
  ];

  it("are found by their command line, whatever started them, and named by what they run", () => {
    // pid 50 is a runtime run by npx, in the install's folder; 51 one of another install.
    const more: ProcessEntry[] = [
      ...list,
      { pid: 50, ppid: 1, command: "node /Users/x/.npm/_npx/aa98/node_modules/wizards/apps/runtime/dist/index.js" },
      { pid: 51, ppid: 1, command: "node /Users/x/.npm/_npx/aa98/node_modules/wizards/apps/runtime/dist/index.js" },
    ];
    const cwd = (pid: number) => (pid === 50 ? home : pid === 51 ? "/srv/engenty/wizards" : "/Users/x");
    const found = wizardsProcesses(home, more, selfAndAncestors(more, 21), cwd);
    expect(found.map((p) => [p.pid, p.kind])).toEqual([
      [10, "start"],
      [11, "runtime"],
      [12, "mcp"],
      [50, "runtime"],
    ]);
  });

  it("never include this process or the ones that started it", () => {
    expect([...selfAndAncestors(list, 21)].sort((a, b) => a - b)).toEqual([1, 20, 21]);
  });

  it("are stopped with SIGTERM, then SIGKILL for the ones that stay", async () => {
    const living = new Set([1, 2]);
    const sent: string[] = [];
    const left = await stopProcesses([1, 2], 300, {
      kill: (pid, signal) => {
        sent.push(`${signal} ${pid}`);
        if (pid === 1 || signal === "SIGKILL") {
          living.delete(pid);
        }
      },
      alive: (pid) => living.has(pid),
      wait: async () => undefined,
    });
    expect(left).toEqual([]);
    expect(sent).toEqual(["SIGTERM 1", "SIGTERM 2", "SIGKILL 2"]);
  });
});

describe("whether a login item is there", () => {
  it("is an error, not a no, where the folder can't be looked into", () => {
    const folder = join(user, "locked");
    mkdirSync(folder);
    touch(join(folder, "item.plist"));
    expect(present(join(folder, "item.plist"))).toBe(true);
    expect(present(join(folder, "other.plist"))).toBe(false);
    if (process.getuid?.() !== 0) {
      chmodSync(folder, 0o000);
      try {
        expect(() => present(join(folder, "item.plist"))).toThrow(/Couldn’t check/);
      } finally {
        chmodSync(folder, 0o755);
      }
    }
  });
});
