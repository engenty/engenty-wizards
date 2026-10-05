import { existsSync, type FSWatcher, mkdirSync, watch } from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  PluginDb,
  PluginTool,
  WizardsPluginApi,
  WizardsPluginFactory,
} from "@engenty-wizards/plugin-sdk";
import { PLUGIN_TOOL_NAME } from "@engenty-wizards/shared/definition";
import { createJiti } from "jiti";
import { packageRoot } from "../cli/home.js";
import { db, onTenantOpen } from "../db/client.js";
import { env } from "../env.js";
import { discoverPlugins, type PluginProblem, type PluginSource } from "./discovery.js";
import { migrateOpenTenants, migratePlugins } from "./migrations.js";
import {
  announceChange,
  compileRoute,
  dropPlugin,
  emptyRecord,
  type LoadedPlugin,
  loadedPlugin,
  loadedPlugins,
  setPlugin,
} from "./registry.js";

/**
 * Loading plugins (docs/content/dev/plugins). A plugin's server half is TypeScript or JavaScript read
 * from its file as it is: no build step, and a reload reads the files again. What a plugin
 * imports of the runtime's own packages comes from the runtime's copies, wherever the plugin's
 * file lies.
 */

/** What ships with this runtime, then the folders of `PLUGINS_DIR`. */
export function pluginDirs(): string[] {
  return [join(packageRoot, "modules"), ...env.plugins.dirs];
}

const own = (specifier: string) => fileURLToPath(import.meta.resolve(specifier));

/** The longer name first: an alias also matches what begins with it. */
function aliases(): Record<string, string> {
  return {
    "@engenty-wizards/plugin-sdk": own("@engenty-wizards/plugin-sdk"),
    "drizzle-orm/sqlite-core": own("drizzle-orm/sqlite-core"),
    "drizzle-orm": own("drizzle-orm"),
    zod: own("zod"),
  };
}

async function importFactory(entry: string): Promise<WizardsPluginFactory> {
  // No module cache: every load evaluates the plugin's files anew.
  const jiti = createJiti(import.meta.url, { moduleCache: false, alias: aliases() });
  const factory = await jiti.import(entry, { default: true });
  if (typeof factory !== "function") {
    throw new Error("The default export is not a function.");
  }
  return factory as WizardsPluginFactory;
}

function apiFor(record: LoadedPlugin): WizardsPluginApi {
  const { source } = record;
  const tag = `[plugin ${source.id}]`;
  return {
    plugin: source.manifest,
    resolvePath: (relative) => resolve(source.root, relative),
    config: { get: (key) => process.env[key]?.trim() || undefined },
    log: {
      info: (...args) => console.log(tag, ...args),
      warn: (...args) => console.warn(tag, ...args),
      error: (...args) => console.error(tag, ...args),
    },
    server: {
      registerHttpRoute(route) {
        record.routes.push(compileRoute(route));
      },
      registerTool(tool) {
        if (!PLUGIN_TOOL_NAME.test(tool.name)) {
          throw new Error(`Tool "${tool.name}": a name is lower case, digits and "_".`);
        }
        if (record.tools.has(tool.name)) {
          throw new Error(`Tool "${tool.name}" is registered twice.`);
        }
        record.tools.set(tool.name, tool as unknown as PluginTool);
      },
      registerMigrations(folder) {
        record.migrations.push(resolve(source.root, folder));
      },
      on(event, listener) {
        const listeners = (record.listeners[event] ?? []) as (typeof listener)[];
        listeners.push(listener);
        record.listeners[event] = listeners as LoadedPlugin["listeners"][typeof event];
      },
      getTenantDb: () => db as unknown as PluginDb,
      onUnload(dispose) {
        record.disposers.push(dispose);
      },
    },
  };
}

/** Runs what the plugin asked to have undone, the last first. */
async function dispose(record: LoadedPlugin) {
  for (const undo of record.disposers.splice(0).reverse()) {
    try {
      await undo();
    } catch (err) {
      console.error(`[plugins] ${record.source.id}: undoing failed:`, err);
    }
  }
}

async function load(source: PluginSource): Promise<LoadedPlugin> {
  const record = emptyRecord(source);
  if (source.entry) {
    try {
      const factory = await importFactory(source.entry);
      await factory(apiFor(record));
    } catch (err) {
      // Half a plugin is worse than none: what it registered before it failed goes as well.
      await dispose(record);
      record.routes = [];
      record.tools.clear();
      record.listeners = {};
      record.migrations = [];
      record.error = (err as Error)?.message || String(err);
      console.error(`[plugins] ${source.id} did not load:`, err);
    }
  }
  setPlugin(record);
  return record;
}

async function unload(id: string) {
  const record = dropPlugin(id);
  if (record) {
    await dispose(record);
  }
}

let problems: PluginProblem[] = [];

/** Files and folders that look like a plugin and are none, as of the last look. */
export function pluginProblems(): PluginProblem[] {
  return problems;
}

function discover(): PluginSource[] {
  const result = discoverPlugins(pluginDirs());
  problems = result.problems;
  for (const problem of problems) {
    console.error(`[plugins] ${problem.path}: ${problem.message}`);
  }
  return result.found;
}

/** One load at a time: the watcher and a person may ask for a reload at the same moment. */
let queue: Promise<unknown> = Promise.resolve();
function inTurn<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.catch(() => undefined).then(work);
  queue = next;
  return next;
}

let hooked = false;

/** At start: finds the plugins and loads each. Must run before a tenant database opens. */
export function loadPlugins(): Promise<void> {
  return inTurn(async () => {
    if (!hooked) {
      hooked = true;
      // A plugin whose tables cannot be made must not keep the tenant's database from opening.
      onTenantOpen((tenantId, client) =>
        migratePlugins(tenantId, client).catch((err) =>
          console.error(`[plugins] tables for tenant ${tenantId}:`, (err as Error).message),
        ),
      );
    }
    const found = discover();
    for (const source of found) {
      await load(source);
    }
    if (found.length) {
      console.log(`plugins: ${found.map((s) => s.id).join(", ")}`);
    }
    await migrateOpenTenants();
    if (env.plugins.watch) {
      watchPlugins();
    }
  });
}

/** Loads one plugin again from its files; a plugin whose files are gone unloads. */
export function reloadPlugin(id: string): Promise<LoadedPlugin | null> {
  return inTurn(async () => {
    const found = discover();
    const source = found.find((s) => s.id === id);
    await unload(id);
    const record = source ? await load(source) : null;
    // Its manifest may name another id now: under the old one it is gone, under the new one new.
    await loadMissing(found);
    await migrateOpenTenants();
    announceChange({ id });
    return record;
  });
}

/** Loads what was found and is not loaded yet. */
async function loadMissing(found: PluginSource[]): Promise<boolean> {
  const missing = found.filter((source) => !loadedPlugin(source.id));
  for (const source of missing) {
    await load(source);
  }
  return missing.length > 0;
}

/**
 * Looks again and leaves what is loaded alone: plugins that are new load, plugins whose files
 * went unload.
 */
export function findNewPlugins(): Promise<void> {
  return inTurn(async () => {
    const found = discover();
    const gone = loadedPlugins().filter((p) => !found.some((s) => s.id === p.source.id));
    for (const plugin of gone) {
      await unload(plugin.source.id);
    }
    if ((await loadMissing(found)) || gone.length) {
      await migrateOpenTenants();
      announceChange({ id: null });
    }
  });
}

/** Loads every plugin anew, new ones included, and unloads what is gone. */
export function rescanPlugins(): Promise<void> {
  return inTurn(async () => {
    const found = discover();
    for (const loaded of loadedPlugins()) {
      await unload(loaded.source.id);
    }
    for (const source of found) {
      await load(source);
    }
    await migrateOpenTenants();
    announceChange({ id: null });
  });
}

/** The studio half was built again: the server half stays as it is, the studio fetches the files. */
function refreshStudioHalf(id: string): Promise<void> {
  return inTurn(async () => {
    const record = loadedPlugin(id);
    const source = discover().find((s) => s.id === id);
    if (record && source) {
      record.source = { ...record.source, studio: source.studio, styles: source.styles };
      announceChange({ id });
    }
  });
}

const watchers: FSWatcher[] = [];

/**
 * Reloads a plugin when one of its files changes. `ui/` is left alone: it only counts once it
 * is built, and a change below `dist/` is that build.
 */
function watchPlugins() {
  for (const watcher of watchers.splice(0)) {
    watcher.close();
  }
  const timers = new Map<string, NodeJS.Timeout>();
  const soon = (key: string, run: () => Promise<unknown>) => {
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        run().catch((err) => console.error("[plugins]", err));
      }, 150),
    );
  };
  for (const dir of pluginDirs()) {
    // A folder of this install's own plugins is made, so the first plugin put there is seen.
    if (env.plugins.dirs.includes(dir)) {
      try {
        mkdirSync(dir, { recursive: true });
      } catch {
        // a place that cannot be written to
      }
    }
    if (!existsSync(dir)) {
      continue;
    }
    const watcher = watch(dir, { recursive: true }, (_event, file) => {
      const parts = file?.toString().split(sep) ?? [];
      if (!parts.length || parts.includes("node_modules") || parts.some((p) => p.startsWith("."))) {
        return;
      }
      const top = join(dir, parts[0]);
      const plugin = loadedPlugins().find((p) =>
        p.source.single ? p.source.entry === top : p.source.root === top,
      );
      const { id, entry } = plugin?.source ?? {};
      if (!id) {
        // A plugin that is new here, or what is left of one that went. The others stay loaded.
        soon("*", findNewPlugins);
      } else if (parts[1] === "dist" && !entry?.startsWith(join(top, "dist") + sep)) {
        soon(`${id}/studio`, () => refreshStudioHalf(id));
      } else if (parts[1] !== "ui") {
        soon(id, () => reloadPlugin(id));
      }
    });
    watcher.unref();
    watchers.push(watcher);
  }
}
