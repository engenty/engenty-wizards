import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { WizardDefinition } from "../../shared/definition.js";
import type { RunAsk, RunState } from "../../shared/run.js";
import type { WorkspaceFile } from "../../shared/workspace.js";

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

/** Personal API keys (Better Auth api-key plugin): MCP clients and scripts act as their user. */
export const apikey = sqliteTable(
  "apikey",
  {
    id: text("id").primaryKey(),
    configId: text("config_id").notNull().default("default"),
    name: text("name"),
    start: text("start"),
    referenceId: text("reference_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    prefix: text("prefix"),
    key: text("key").notNull(),
    refillInterval: integer("refill_interval"),
    refillAmount: integer("refill_amount"),
    lastRefillAt: integer("last_refill_at", { mode: "timestamp_ms" }),
    enabled: integer("enabled", { mode: "boolean" }).default(true),
    rateLimitEnabled: integer("rate_limit_enabled", { mode: "boolean" }).default(true),
    rateLimitTimeWindow: integer("rate_limit_time_window"),
    rateLimitMax: integer("rate_limit_max"),
    requestCount: integer("request_count").default(0),
    remaining: integer("remaining"),
    lastRequest: integer("last_request", { mode: "timestamp_ms" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    permissions: text("permissions"),
    metadata: text("metadata"),
  },
  (t) => [index("apikey_key").on(t.key), index("apikey_reference").on(t.referenceId)],
);

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
    ownerId: text("owner_id").notNull(),
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

// --- OAuth for MCP clients (Better Auth jwt + mcp/oauth-provider) ------------
// Arrays and JSON values arrive serialised by the auth adapter, so they are plain text here.

/** Keys the OAuth access tokens are signed with. */
export const jwks = sqliteTable("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  alg: text("alg"),
  crv: text("crv"),
});

/** MCP clients (Claude Code, Cursor, Codex …), registered dynamically or from a metadata document. */
export const oauthClient = sqliteTable(
  "oauth_client",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull().unique(),
    clientSecret: text("client_secret"),
    clientDiscoveryId: text("client_discovery_id"),
    disabled: integer("disabled", { mode: "boolean" }).default(false),
    skipConsent: integer("skip_consent", { mode: "boolean" }),
    enableEndSession: integer("enable_end_session", { mode: "boolean" }),
    subjectType: text("subject_type"),
    scopes: text("scopes"),
    clientCredentialsScopes: text("client_credentials_scopes"),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
    name: text("name"),
    uri: text("uri"),
    icon: text("icon"),
    contacts: text("contacts"),
    tos: text("tos"),
    policy: text("policy"),
    softwareId: text("software_id"),
    softwareVersion: text("software_version"),
    softwareStatement: text("software_statement"),
    redirectUris: text("redirect_uris").notNull(),
    postLogoutRedirectUris: text("post_logout_redirect_uris"),
    backchannelLogoutUri: text("backchannel_logout_uri"),
    backchannelLogoutSessionRequired: integer("backchannel_logout_session_required", {
      mode: "boolean",
    }),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
    applicationType: text("application_type"),
    jwks: text("jwks"),
    jwksUri: text("jwks_uri"),
    grantTypes: text("grant_types"),
    responseTypes: text("response_types"),
    requirePKCE: integer("require_pkce", { mode: "boolean" }),
    dpopBoundAccessTokens: integer("dpop_bound_access_tokens", { mode: "boolean" }).default(false),
    referenceId: text("reference_id"),
    metadata: text("metadata"),
  },
  (t) => [index("oauth_client_user").on(t.userId)],
);

export const oauthResource = sqliteTable("oauth_resource", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull().unique(),
  name: text("name").notNull(),
  accessTokenTtl: integer("access_token_ttl"),
  refreshTokenTtl: integer("refresh_token_ttl"),
  signingAlgorithm: text("signing_algorithm"),
  signingKeyId: text("signing_key_id"),
  allowedScopes: text("allowed_scopes"),
  customClaims: text("custom_claims"),
  dpopBoundAccessTokensRequired: integer("dpop_bound_access_tokens_required", {
    mode: "boolean",
  }).default(false),
  disabled: integer("disabled", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
  policyVersion: integer("policy_version").default(1),
  metadata: text("metadata"),
});

export const oauthClientResource = sqliteTable(
  "oauth_client_resource",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    resourceId: text("resource_id")
      .notNull()
      .references(() => oauthResource.identifier, { onDelete: "cascade" }),
    metadata: text("metadata"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("oauth_client_resource_client").on(t.clientId),
    index("oauth_client_resource_resource").on(t.resourceId),
  ],
);

export const oauthRefreshToken = sqliteTable(
  "oauth_refresh_token",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources"),
    requestedUserInfoClaims: text("requested_user_info_claims"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }),
    revoked: integer("revoked", { mode: "timestamp_ms" }),
    rotatedAt: integer("rotated_at", { mode: "timestamp_ms" }),
    rotationReplayResponse: text("rotation_replay_response"),
    rotationReplayExpiresAt: integer("rotation_replay_expires_at", { mode: "timestamp_ms" }),
    authTime: integer("auth_time", { mode: "timestamp_ms" }),
    confirmation: text("confirmation"),
    scopes: text("scopes").notNull(),
  },
  (t) => [
    index("oauth_refresh_token_client").on(t.clientId),
    index("oauth_refresh_token_session").on(t.sessionId),
    index("oauth_refresh_token_user").on(t.userId),
    index("oauth_refresh_token_code").on(t.authorizationCodeId),
  ],
);

export const oauthAccessToken = sqliteTable(
  "oauth_access_token",
  {
    id: text("id").primaryKey(),
    token: text("token").unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources"),
    requestedUserInfoClaims: text("requested_user_info_claims"),
    refreshId: text("refresh_id").references(() => oauthRefreshToken.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }),
    revoked: integer("revoked", { mode: "timestamp_ms" }),
    confirmation: text("confirmation"),
    scopes: text("scopes").notNull(),
  },
  (t) => [
    index("oauth_access_token_client").on(t.clientId),
    index("oauth_access_token_session").on(t.sessionId),
    index("oauth_access_token_user").on(t.userId),
    index("oauth_access_token_code").on(t.authorizationCodeId),
    index("oauth_access_token_refresh").on(t.refreshId),
  ],
);

/** What the admin allowed a client; "Trennen" in the settings deletes it with the client's tokens. */
export const oauthConsent = sqliteTable(
  "oauth_consent",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    resources: text("resources"),
    requestedUserInfoClaims: text("requested_user_info_claims"),
    scopes: text("scopes").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("oauth_consent_client").on(t.clientId), index("oauth_consent_user").on(t.userId)],
);

export const oauthClientAssertion = sqliteTable("oauth_client_assertion", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});
