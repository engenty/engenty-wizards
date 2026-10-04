import type { WizardDefinition } from "@engenty-wizards/shared/definition";
import type {
  Capability,
  Industry,
  ItemFormat,
  ItemStatus,
  MarketplaceLang,
  UseCase,
} from "@engenty-wizards/shared/marketplace";
import { sql } from "drizzle-orm";
import { blob, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
    /** `wizard` = a share link `/w/<token>`, `result` = a shared result `/s/<token>`, `logo` = a brand logo. */
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

// --- marketplace -----------------------------------------------------------------
// Wizards anyone can start from. They belong to no tenant: the base set comes from the repo
// (apps/runtime/src/starters), admins add and change entries, and a runtime that runs alone
// takes over what the cloud runtime lists.

export const marketplaceItem = sqliteTable(
  "marketplace_item",
  {
    id: text("id").primaryKey(),
    status: text("status").$type<ItemStatus>().notNull().default("draft"),
    /** Goes up with every change of the wizard; a translation names the revision it was made from. */
    revision: integer("revision").notNull().default(1),
    /** `base` = as the repo ships it, `admin` = made or changed by an admin here, `cloud` = taken over from the cloud runtime. */
    origin: text("origin", { enum: ["base", "admin", "cloud"] })
      .notNull()
      .default("admin"),
    /** The revision of the repo's base set this row was last written from. */
    baseRevision: integer("base_revision"),
    /** The language the wizard was written in. */
    language: text("language").$type<MarketplaceLang>().notNull().default("de"),
    avatar: text("avatar").notNull().default("round"),
    formats: text("formats", { mode: "json" }).$type<ItemFormat[]>().notNull(),
    industries: text("industries", { mode: "json" }).$type<Industry[]>().notNull(),
    useCases: text("use_cases", { mode: "json" }).$type<UseCase[]>().notNull(),
    capabilities: text("capabilities", { mode: "json" }).$type<Capability[]>().notNull(),
    /** What people ask for when they mean this entry, in every language: searched, never shown. */
    searchTerms: text("search_terms", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    /** A run's price in credits as last estimated, and what it rarely exceeds. */
    credits: integer("credits"),
    creditsHigh: integer("credits_high"),
    position: integer("position").notNull().default(1000),
    installs: integer("installs").notNull().default(0),
    updatedBy: text("updated_by"),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [index("marketplace_item_updated").on(t.updatedAt)],
);

/** An entry's words and wizard in one language: the entry's own, and every translation of it. */
export const marketplaceText = sqliteTable(
  "marketplace_text",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => marketplaceItem.id, { onDelete: "cascade" }),
    language: text("language").$type<MarketplaceLang>().notNull(),
    /** The entry's revision these words belong to; an older one is out of date. */
    revision: integer("revision").notNull(),
    title: text("title").notNull(),
    pitch: text("pitch").notNull(),
    definition: text("definition", { mode: "json" }).$type<WizardDefinition>().notNull(),
    /** Written by a model, not by a person. */
    machine: integer("machine", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.language] })],
);

/** The workspace an entry's wizard starts with (widgets, price lists, reference texts). */
export const marketplaceFile = sqliteTable(
  "marketplace_file",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => marketplaceItem.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    data: blob("data", { mode: "buffer" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.path] })],
);
