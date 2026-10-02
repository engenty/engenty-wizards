import { defineConfig } from "drizzle-kit";

/** Two schemas: `pnpm db:generate` writes a migration for each that changed. */
const which = process.env.DB_SCHEMA === "control" ? "control" : "tenant";

export default defineConfig({
  dialect: "sqlite",
  schema: which === "control" ? "./server/db/control-schema.ts" : "./server/db/schema.ts",
  out: `./server/db/migrations/${which}`,
});
