import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Client } from "@libsql/client";
import { openTenantClients } from "../db/client.js";
import { loadedPlugins } from "./registry.js";

/**
 * A plugin's own tables. Each `.sql` file of the folders a plugin registered runs once per
 * tenant database, in the order of the file names; `plugin_migration` records which ran. A
 * database gets them when it opens, and the open ones get them when a plugin loads. Unloading a
 * plugin leaves its tables and their rows where they are.
 */

const RECORD = `CREATE TABLE IF NOT EXISTS plugin_migration (
  plugin TEXT NOT NULL,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL,
  PRIMARY KEY (plugin, name)
)`;

/** One at a time per database: a plugin that loads while a database opens must not run a file twice. */
const queues = new Map<string, Promise<void>>();

async function apply(client: Client) {
  const pending = loadedPlugins().filter((p) => p.migrations.length);
  if (!pending.length) {
    return;
  }
  await client.execute(RECORD);
  const done = await client.execute("SELECT plugin, name FROM plugin_migration");
  const ran = new Set(done.rows.map((row) => `${row.plugin}/${row.name}`));
  for (const plugin of pending) {
    for (const folder of plugin.migrations) {
      const files = readdirSync(folder)
        .filter((name) => name.endsWith(".sql"))
        .sort();
      for (const name of files) {
        if (ran.has(`${plugin.source.id}/${name}`)) {
          continue;
        }
        // The file and its record go in together or not at all.
        const tx = await client.transaction("write");
        try {
          await tx.executeMultiple(readFileSync(join(folder, name), "utf8"));
          await tx.execute({
            sql: "INSERT INTO plugin_migration (plugin, name, applied_at) VALUES (?, ?, ?)",
            args: [plugin.source.id, name, Date.now()],
          });
          await tx.commit();
        } catch (err) {
          await tx.rollback().catch(() => undefined);
          throw new Error(`Plugin "${plugin.source.id}", ${name}: ${(err as Error).message}`);
        } finally {
          tx.close();
        }
      }
    }
  }
}

export function migratePlugins(tenantId: string, client: Client): Promise<void> {
  const next = (queues.get(tenantId) ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => apply(client));
  queues.set(tenantId, next);
  return next;
}

/** After a plugin loaded: its tables for every database that is open already. */
export async function migrateOpenTenants(): Promise<void> {
  for (const [tenantId, client] of await openTenantClients()) {
    await migratePlugins(tenantId, client).catch((err) =>
      console.error(`[plugins] tables for tenant ${tenantId}:`, (err as Error).message),
    );
  }
}
