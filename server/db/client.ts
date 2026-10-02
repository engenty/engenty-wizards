import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Client, createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { env } from "../env.js";
import { currentTenant, inTenant } from "../tenant.js";
import * as control from "./control-schema.js";
import * as schema from "./schema.js";

mkdirSync(join(env.dataDir, "tenants"), { recursive: true });

const here = dirname(fileURLToPath(import.meta.url));

/** Migrations ship as SQL files next to the source; the built server reads the same folders. */
function migrationsFolder(name: "tenant" | "control"): string {
  const candidates = [
    join(here, "migrations", name),
    resolve(here, "../../../server/db/migrations", name),
  ];
  return candidates.find((c) => existsSync(c)) ?? candidates[0];
}

function open(url: string, authToken: string): Client {
  return createClient({ url, ...(authToken ? { authToken } : {}) });
}

async function prepare(client: Client, url: string) {
  if (url.startsWith("file:")) {
    await client.execute("PRAGMA journal_mode = WAL");
    await client.execute("PRAGMA busy_timeout = 5000");
  }
  await client.execute("PRAGMA foreign_keys = ON");
}

// --- control database --------------------------------------------------------

const controlUrl = env.databaseUrl || `file:${join(env.dataDir, "control.db")}`;
const controlClient = open(controlUrl, env.databaseAuthToken);

/** Links, the run index, sessions and settings: what is known before a tenant's database opens. */
export const controlDb = drizzle(controlClient, { schema: control });
export { control };

export async function migrateControlDb() {
  await prepare(controlClient, controlUrl);
  await migrate(controlDb, { migrationsFolder: migrationsFolder("control") });
}

// --- tenant databases --------------------------------------------------------

function makeTenantDb(client: Client) {
  return drizzle(client, { schema });
}
export type Db = ReturnType<typeof makeTenantDb>;

const opened = new Map<string, Promise<Db>>();
const clients = new Map<string, Client>();

/** Where a tenant's database lives: the URL the Manage-App handed out, else a file in the data folder. */
function tenantUrl(id: string, dbUrl: string | null): string {
  if (dbUrl) {
    return dbUrl;
  }
  if (env.tenantDbUrlTemplate) {
    return env.tenantDbUrlTemplate.replaceAll("{tenant}", id.toLowerCase());
  }
  return `file:${join(env.dataDir, "tenants", `${id}.db`)}`;
}

async function openTenant(id: string): Promise<Db> {
  let row = await controlDb.query.tenant.findFirst({ where: eq(control.tenant.id, id) });
  if (!row) {
    await controlDb.insert(control.tenant).values({ id }).onConflictDoNothing();
    row = (await controlDb.query.tenant.findFirst({ where: eq(control.tenant.id, id) }))!;
  }
  const url = tenantUrl(id, row.dbUrl);
  const client = open(url, url.startsWith("file:") ? "" : env.tenantDbAuthToken);
  clients.set(id, client);
  await prepare(client, url);
  const db = makeTenantDb(client);
  // Every database is brought to the current schema when it is first opened.
  await migrate(db, { migrationsFolder: migrationsFolder("tenant") });
  return db;
}

/** The only way to a tenant's tables. Opens the database once per process and migrates it then. */
export function tenantDb(id: string): Promise<Db> {
  let db = opened.get(id);
  if (!db) {
    db = openTenant(id).catch((err) => {
      opened.delete(id);
      throw err;
    });
    opened.set(id, db);
  }
  return db;
}

/** Records where the Manage-App created the tenant's database, before it is first opened. */
export async function registerTenant(id: string, dbUrl: string | null) {
  await controlDb
    .insert(control.tenant)
    .values({ id, dbUrl })
    .onConflictDoUpdate({ target: control.tenant.id, set: { dbUrl } });
}

const ready = new Map<string, Db>();

/** Closes and forgets an open tenant database (the tenant was deleted or moved). */
export function closeTenantDb(id: string) {
  opened.delete(id);
  ready.delete(id);
  clients.get(id)?.close();
  clients.delete(id);
}

/** Opens the current tenant's database; `db` works synchronously afterwards. */
export async function openTenantDb(id: string): Promise<void> {
  if (!ready.has(id)) {
    ready.set(id, await tenantDb(id));
  }
}

/** Runs `fn` for one tenant: opens its database, then sets the context `db` resolves from. */
export async function withTenant<T>(id: string, fn: () => T | Promise<T>): Promise<T> {
  await openTenantDb(id);
  return inTenant(id, fn);
}

/**
 * The current tenant's database, resolved from the context `inTenant()` set. Code that reads or
 * writes wizards, runs or files never names a tenant itself.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const id = currentTenant();
    const target = ready.get(id);
    if (!target) {
      throw new Error(`Tenant database "${id}" is not open: enter it with withTenant().`);
    }
    const value = Reflect.get(target as object, prop);
    return typeof value === "function" ? value.bind(target) : value;
  },
});

export { schema };

/** Brings every known tenant database to the current schema (after a release). */
export async function migrateAllTenants(): Promise<{ migrated: number; failed: string[] }> {
  const tenants = await controlDb.select({ id: control.tenant.id }).from(control.tenant);
  const failed: string[] = [];
  let migrated = 0;
  const queue = [...tenants];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let t = queue.shift(); t; t = queue.shift()) {
        try {
          await openTenantDb(t.id);
          migrated++;
        } catch (err) {
          console.error(`[migrate ${t.id}]`, err);
          failed.push(t.id);
        }
      }
    }),
  );
  return { migrated, failed };
}

export async function knownTenants(): Promise<string[]> {
  const rows = await controlDb.select({ id: control.tenant.id }).from(control.tenant);
  return rows.map((r) => r.id);
}
