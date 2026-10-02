import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { env } from "../env.js";
import * as schema from "./schema.js";

mkdirSync(env.dataDir, { recursive: true });

const url = env.databaseUrl || `file:${join(env.dataDir, "wizards.db")}`;

export const libsql = createClient({
  url,
  ...(env.databaseAuthToken ? { authToken: env.databaseAuthToken } : {}),
});

export const db = drizzle(libsql, { schema });
export type Db = typeof db;
export { schema };

const here = dirname(fileURLToPath(import.meta.url));

/** Migrations ship as SQL files next to the source; the built server reads the same folder. */
function migrationsFolder(): string {
  const candidates = [join(here, "migrations"), resolve(here, "../../../server/db/migrations")];
  return candidates.find((c) => existsSync(c)) ?? candidates[0];
}

export async function migrateDb() {
  if (url.startsWith("file:")) {
    await libsql.execute("PRAGMA journal_mode = WAL");
    await libsql.execute("PRAGMA busy_timeout = 5000");
  }
  await libsql.execute("PRAGMA foreign_keys = ON");
  await migrate(db, { migrationsFolder: migrationsFolder() });
}
