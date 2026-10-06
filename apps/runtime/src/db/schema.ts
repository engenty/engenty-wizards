import type { WizardDefinition } from "@engenty-wizards/shared/definition";
import type { TableColumn } from "@engenty-wizards/shared/engenty/data-tables";
import type { BrandColor, ProjectFact } from "@engenty-wizards/shared/projects";
import type { RunAsk, RunState } from "@engenty-wizards/shared/run";
import type { WorkspaceFile } from "@engenty-wizards/shared/workspace";
import { sql } from "drizzle-orm";
import {
  blob,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { ImportedConnectorRecord } from "../engenty/connections-external/types.js";

const now = sql`(unixepoch() * 1000)`;
const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull().default(now);
const updatedAt = () => integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now);

// One database per tenant holds these tables; `tenant_id` stays in every row so a tenant's
// rows can be moved or merged. Users and tenants themselves live outside (Manage-App).

export interface McpServerConfig {
  id: string;
  name: string;
  url: string;
  headers?: Record<string, string>;
}

export interface BrandConfig {
  /** The title end users see: a company, a brand, an undertaking. */
  name?: string;
  /** Free text about it: what it does, for whom, in which tone it speaks. */
  about?: string;
  /** The first colour is the accent of documents, dashboards and public pages. */
  colors?: BrandColor[];
}

export const project = sqliteTable(
  "project",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    name: text("name").notNull(),
    brand: text("brand", { mode: "json" }).$type<BrandConfig>().notNull().default({}),
    facts: text("facts", { mode: "json" }).$type<ProjectFact[]>().notNull().default([]),
    mcpServers: text("mcp_servers", { mode: "json" })
      .$type<McpServerConfig[]>()
      .notNull()
      .default([]),
    /**
     * `local`: the project of a local install, synced here when that install publishes. It keeps
     * the ids it has there and is changed only by the next sync. Null: made on this runtime.
     */
    origin: text("origin", { enum: ["local"] }),
    syncedAt: integer("synced_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("project_tenant").on(t.tenantId)],
);

export const wizard = sqliteTable(
  "wizard",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id").notNull(),
    title: text("title").notNull(),
    draft: text("draft", { mode: "json" }).$type<WizardDefinition>().notNull(),
    publishedVersion: integer("published_version"),
    shareToken: text("share_token").notNull(),
    shareEnabled: integer("share_enabled", { mode: "boolean" }).notNull().default(true),
    dailyRunLimit: integer("daily_run_limit").notNull().default(50),
    starter: text("starter"),
    /** The revision of the marketplace entry the wizard was made from. */
    starterRevision: integer("starter_revision"),
    /** Bumped on every draft write; a write carrying an older one is refused. */
    revision: integer("revision").notNull().default(0),
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
    /** The workspace as it was at publish time. */
    files: text("files", { mode: "json" }).$type<WorkspaceFile[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("wizard_version_n").on(t.wizardId, t.version)],
);

/** The draft's workspace: widget code, libraries, reference data. Content lives in the blob store. */
export const wizardFile = sqliteTable(
  "wizard_file",
  {
    wizardId: text("wizard_id")
      .notNull()
      .references(() => wizard.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    hash: text("hash").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.wizardId, t.path] })],
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
    /** "mcp": written by an admin's own client (Claude Code, Cursor …) named in `client`. */
    source: text("source", { enum: ["studio", "mcp"] })
      .notNull()
      .default("studio"),
    client: text("client"),
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
    tenantId: text("tenant_id").notNull(),
    /** The definition the run started on — edits never reach a running wizard. */
    definition: text("definition", { mode: "json" }).$type<WizardDefinition>().notNull(),
    /** The workspace the run started with. */
    files: text("files", { mode: "json" }).$type<WorkspaceFile[]>().notNull().default([]),
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
    /** What a running step is asking the person right now (a login, a code); null = nothing. */
    ask: text("ask", { mode: "json" }).$type<RunAsk | null>(),
    costMicros: integer("cost_micros").notNull().default(0),
    /** Set once the result is shared: `/s/<token>` shows it read-only. */
    shareToken: text("share_token"),
    sharedAt: integer("shared_at", { mode: "timestamp_ms" }),
    /** Runs without an account are deleted after this; null keeps the run. */
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("run_share_token").on(t.shareToken),
    index("run_expires").on(t.expiresAt),
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
    /** A picture of the run the event is about; shown while the step works. */
    assetId: text("asset_id"),
    createdAt: createdAt(),
  },
  (t) => [index("run_event_run").on(t.runId, t.id)],
);

/** What each step of a run cost, in credit micros: the measurements estimates are made from. */
export const runCost = sqliteTable(
  "run_cost",
  {
    runId: text("run_id")
      .notNull()
      .references(() => run.id, { onDelete: "cascade" }),
    stepId: text("step_id").notNull(),
    micros: integer("micros").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.runId, t.stepId] })],
);

export const asset = sqliteTable(
  "asset",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
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

/**
 * A service imported as a connector, from the integrations registry or a pasted OpenAPI spec /
 * MCP endpoint. The record is engenty's: actions, auth and source, normalised at import time.
 */
export const projectConnector = sqliteTable(
  "project_connector",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    record: text("record", { mode: "json" }).$type<ImportedConnectorRecord>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.id] })],
);

/**
 * What a project holds for all its wizards: logos, assets (images, graphics, videos) and
 * documents. `id` is the asset the content lives in. The first logo is the one end users see.
 */
export const projectFile = sqliteTable(
  "project_file",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["logo", "asset", "document"] }).notNull(),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    description: text("description").notNull().default(""),
    /** A web address the file was fetched from, when it was not uploaded. */
    source: text("source"),
    position: integer("position").notNull().default(0),
    /** `pending` while it is read, described and indexed. */
    status: text("status", { enum: ["pending", "ready", "failed"] })
      .notNull()
      .default("ready"),
    error: text("error"),
    /** A document's text as Markdown, in the blob store. */
    textHash: text("text_hash"),
    pages: integer("pages"),
    chars: integer("chars"),
    /** What the index holds of a document; `embeddings` includes the keywords. */
    indexed: text("indexed", { enum: ["embeddings", "keywords"] }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("project_file_project").on(t.projectId, t.kind, t.position)],
);

/**
 * The document index: passages of a project's documents, and of the texts plugins put in
 * (`server.index`). Keywords live in the FTS5 table `project_chunk_fts`, which triggers keep
 * in step (see the migrations); `embedding` is the passage's vector as float32 bytes, compared
 * with libSQL's `vector_distance_cos`.
 */
export const projectChunk = sqliteTable(
  "project_chunk",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    /** The document the passage is of; null for a plugin's text. */
    fileId: text("file_id").references(() => projectFile.id, { onDelete: "cascade" }),
    /** A plugin's text: the plugin, its key for the text, its title and where the studio shows it. */
    plugin: text("plugin"),
    ref: text("ref"),
    title: text("title"),
    link: text("link"),
    idx: integer("idx").notNull(),
    text: text("text").notNull(),
    embedding: blob("embedding", { mode: "buffer" }),
    /** The model the vector was made with; only vectors of one model are compared. */
    model: text("model"),
  },
  (t) => [
    index("project_chunk_project").on(t.projectId, t.model),
    index("project_chunk_file").on(t.fileId),
    index("project_chunk_ref").on(t.projectId, t.plugin, t.ref),
  ],
);

// --- The space's data -------------------------------------------------------
// Tables and pages a space keeps, its own or one of its wizards'. Shared by everyone who works
// in the space, unlike the wizard's store below, which belongs to one person.

/** A table: its columns are engenty data-table columns, its rows in `space_table_row`. */
export const spaceTable = sqliteTable(
  "space_table",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    /** The wizard it belongs to; null: the space's own. */
    wizardId: text("wizard_id").references(() => wizard.id, { onDelete: "cascade" }),
    /**
     * The wizard's shared list it keeps: its title, columns and key come from the wizard's
     * definition, its rows from every run. Null: a table made in the studio.
     */
    list: text("list"),
    /** The column a row is matched on, as the list says. */
    keyColumn: text("key_column"),
    title: text("title").notNull(),
    columns: text("columns", { mode: "json" }).$type<TableColumn[]>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("space_table_project").on(t.projectId, t.wizardId),
    uniqueIndex("space_table_list").on(t.wizardId, t.list),
  ],
);

/** A row of a table: cells by column id. Rows stand in the order they were added. */
export const spaceTableRow = sqliteTable(
  "space_table_row",
  {
    id: text("id").primaryKey(),
    tableId: text("table_id")
      .notNull()
      .references(() => spaceTable.id, { onDelete: "cascade" }),
    /** The key column's value, normalised: saving a row with a known key updates that row. */
    key: text("key"),
    cells: text("cells", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("space_table_row_table").on(t.tableId, t.createdAt),
    index("space_table_row_key").on(t.tableId, t.key),
  ],
);

/** A page: a title and markdown, what the editor shows and an agent reads and writes. */
export const spacePage = sqliteTable(
  "space_page",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    wizardId: text("wizard_id").references(() => wizard.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    markdown: text("markdown").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("space_page_project").on(t.projectId, t.wizardId)],
);

// --- The wizard's store ------------------------------------------------------
// What a wizard keeps between runs for one person. `holder` is that person: "u:<userId>" for a
// signed-in admin, "v:<visitorId>" for an end user on a shared link.

/** One (wizard, person) pair that has stored something; `usedAt` drives the clean-up. */
export const storeHolder = sqliteTable(
  "store_holder",
  {
    wizardId: text("wizard_id")
      .notNull()
      .references(() => wizard.id, { onDelete: "cascade" }),
    holder: text("holder").notNull(),
    usedAt: integer("used_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.wizardId, t.holder] }), index("store_holder_used").on(t.usedAt)],
);

/** A row of one of the wizard's lists. Columns are defined in the wizard, values live here. */
export const storeRow = sqliteTable(
  "store_row",
  {
    id: text("id").primaryKey(),
    wizardId: text("wizard_id")
      .notNull()
      .references(() => wizard.id, { onDelete: "cascade" }),
    holder: text("holder").notNull(),
    list: text("list").notNull(),
    /** The key column's value, normalised; saving a row with a known key updates that row. */
    key: text("key"),
    cells: text("cells", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("store_row_key").on(t.wizardId, t.holder, t.list, t.key),
    index("store_row_list").on(t.wizardId, t.holder, t.list, t.createdAt),
  ],
);

/** A file the wizard keeps (a downloaded invoice, a scan). Content lives in the blob store. */
export const storeFile = sqliteTable(
  "store_file",
  {
    wizardId: text("wizard_id")
      .notNull()
      .references(() => wizard.id, { onDelete: "cascade" }),
    holder: text("holder").notNull(),
    path: text("path").notNull(),
    hash: text("hash").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    source: text("source"),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.wizardId, t.holder, t.path] })],
);

/** A connected account or a kept browser session. `data` is encrypted. */
export const storeSecret = sqliteTable(
  "store_secret",
  {
    id: text("id").primaryKey(),
    wizardId: text("wizard_id")
      .notNull()
      .references(() => wizard.id, { onDelete: "cascade" }),
    holder: text("holder").notNull(),
    /** "connection:<id>" or "browser:<host>". */
    slot: text("slot").notNull(),
    provider: text("provider").notNull(),
    /** Shown to the person: the account's address or the site's name. */
    label: text("label").notNull(),
    data: text("data").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("store_secret_slot").on(t.wizardId, t.holder, t.slot)],
);

/** Marketplace entries starred here: the runtime keeps them for offline use. */
export const marketplaceStar = sqliteTable(
  "marketplace_star",
  {
    tenantId: text("tenant_id").notNull(),
    entryId: text("entry_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.entryId] })],
);
