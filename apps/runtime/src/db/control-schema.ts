import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch() * 1000)`;
const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull().default(now);

// The control database: what the runtime must know before it can open a tenant's database,
// and what it counts across tenants. No wizard, run content or file lives here.

/** Every tenant this runtime has opened. `dbUrl` null = a libSQL file in the data folder. */
export const tenant = sqliteTable("tenant", {
  id: text("id").primaryKey(),
  status: text("status", { enum: ["active", "suspended"] })
    .notNull()
    .default("active"),
  dbUrl: text("db_url"),
  createdAt: createdAt(),
});

/** Public tokens that arrive without a session: which tenant, and which row there. */
export const link = sqliteTable(
  "link",
  {
    token: text("token").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    /** `wizard` = a share link `/r/<token>`, `result` = a shared result `/s/<token>`, `logo` = a brand logo. */
    kind: text("kind", { enum: ["wizard", "result", "logo"] }).notNull(),
    ref: text("ref").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("link_tenant").on(t.tenantId)],
);

/**
 * One row per run: finds the run's tenant, counts a visitor's runs across all wizards, and
 * marks the runs that are working (resumed after a restart, counted against the tenant's limit).
 */
export const runIndex = sqliteTable(
  "run_index",
  {
    runId: text("run_id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    visitorId: text("visitor_id"),
    ipHash: text("ip_hash"),
    active: integer("active", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("run_index_visitor").on(t.visitorId, t.createdAt),
    index("run_index_ip").on(t.ipHash, t.createdAt),
    index("run_index_active").on(t.active, t.tenantId),
  ],
);

/** A studio session of someone signed in at the Manage-App. The refresh token is encrypted. */
export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    role: text("role").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    image: text("image"),
    refreshToken: text("refresh_token"),
    /** When the access token's claims (tenant, role) must be renewed. */
    claimsExpireAt: integer("claims_expire_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("session_expires").on(t.expiresAt)],
);

/** Settings of a runtime that runs alone: model bindings, the linked account. Never secrets. */
export const setting = sqliteTable("setting", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>().notNull(),
});
