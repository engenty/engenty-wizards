import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { WizardDefinition } from "../../shared/definition.js";
import type { RunState } from "../../shared/run.js";

const now = sql`(unixepoch() * 1000)`;
const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull().default(now);
const updatedAt = () => integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now);

// --- Better Auth -----------------------------------------------------------

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// --- Billing ---------------------------------------------------------------

/** 1 credit = 1 cent of provider cost; stored in micros so cheap calls still add up. */
export const billing = sqliteTable("billing", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  plan: text("plan", { enum: ["free", "pro"] })
    .notNull()
    .default("free"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  /** Monthly allowance left, micros. Refilled when `allowanceResetAt` passes. */
  allowanceMicros: integer("allowance_micros").notNull().default(0),
  allowanceResetAt: integer("allowance_reset_at", { mode: "timestamp_ms" }),
  /** Bought credits, never expire, micros. */
  topupMicros: integer("topup_micros").notNull().default(0),
  updatedAt: updatedAt(),
});

export const creditLedger = sqliteTable(
  "credit_ledger",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    deltaMicros: integer("delta_micros").notNull(),
    reason: text("reason").notNull(),
    runId: text("run_id"),
    createdAt: createdAt(),
  },
  (t) => [index("credit_ledger_user").on(t.userId, t.createdAt)],
);

// --- Product ---------------------------------------------------------------

export interface McpServerConfig {
  id: string;
  name: string;
  url: string;
  headers?: Record<string, string>;
}

export interface BrandConfig {
  name?: string;
  /** Free text: address, VAT id, bank details, tone — offered to every step as {{brand.details}}. */
  details?: string;
  accent?: string;
  logoAssetId?: string;
}

export const project = sqliteTable(
  "project",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    brand: text("brand", { mode: "json" }).$type<BrandConfig>().notNull().default({}),
    mcpServers: text("mcp_servers", { mode: "json" })
      .$type<McpServerConfig[]>()
      .notNull()
      .default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("project_owner").on(t.ownerId)],
);

export const wizard = sqliteTable(
  "wizard",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    draft: text("draft", { mode: "json" }).$type<WizardDefinition>().notNull(),
    publishedVersion: integer("published_version"),
    shareToken: text("share_token").notNull(),
    shareEnabled: integer("share_enabled", { mode: "boolean" }).notNull().default(true),
    dailyRunLimit: integer("daily_run_limit").notNull().default(50),
    starter: text("starter"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("wizard_share_token").on(t.shareToken),
    index("wizard_project").on(t.projectId),
  ],
);

export const wizardVersion = sqliteTable(
  "wizard_version",
  {
    id: text("id").primaryKey(),
    wizardId: text("wizard_id")
      .notNull()
      .references(() => wizard.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    definition: text("definition", { mode: "json" }).$type<WizardDefinition>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("wizard_version_n").on(t.wizardId, t.version)],
);

export const wizardMessage = sqliteTable(
  "wizard_message",
  {
    id: text("id").primaryKey(),
    wizardId: text("wizard_id")
      .notNull()
      .references(() => wizard.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    /** Set on assistant turns that changed the wizard. */
    changed: integer("changed", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("wizard_message_wizard").on(t.wizardId, t.createdAt)],
);

export const run = sqliteTable(
  "run",
  {
    id: text("id").primaryKey(),
    wizardId: text("wizard_id")
      .notNull()
      .references(() => wizard.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").notNull(),
    /** The definition the run started on — edits never reach a running wizard. */
    definition: text("definition", { mode: "json" }).$type<WizardDefinition>().notNull(),
    version: integer("version"),
    mode: text("mode", { enum: ["test", "live"] }).notNull(),
    visitorId: text("visitor_id"),
    userId: text("user_id"),
    ipHash: text("ip_hash"),
    status: text("status", {
      enum: ["waiting_input", "running", "done", "failed", "cancelled"],
    }).notNull(),
    cursor: text("cursor"),
    state: text("state", { mode: "json" }).$type<RunState>().notNull(),
    error: text("error"),
    costMicros: integer("cost_micros").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("run_wizard").on(t.wizardId, t.createdAt),
    index("run_visitor").on(t.visitorId, t.createdAt),
    index("run_status").on(t.status),
  ],
);

export const runEvent = sqliteTable(
  "run_event",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id")
      .notNull()
      .references(() => run.id, { onDelete: "cascade" }),
    stepId: text("step_id"),
    type: text("type", { enum: ["step_started", "step_done", "tool", "info", "error"] }).notNull(),
    message: text("message").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("run_event_run").on(t.runId, t.id)],
);

export const asset = sqliteTable(
  "asset",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    runId: text("run_id"),
    stepId: text("step_id"),
    kind: text("kind").notNull(),
    mime: text("mime").notNull(),
    name: text("name").notNull(),
    path: text("path").notNull(),
    size: integer("size").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("asset_run").on(t.runId)],
);
