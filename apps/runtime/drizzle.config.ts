import { defineConfig } from "drizzle-kit";

/** Two schemas: `pnpm db:generate` writes a migration for each that changed. */
const which = process.env.DB_SCHEMA === "control" ? "control" : "tenant";

export default defineConfig({
  dialect: "sqlite",
  schema: which === "control" ? "./src/db/control-schema.ts" : "./src/db/schema.ts",
  out: `./src/db/migrations/${which}`,
});
