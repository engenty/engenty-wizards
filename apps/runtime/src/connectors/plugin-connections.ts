import type { PluginConnection, PluginConnections } from "@engenty-wizards/plugin-sdk";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "../db/client.js";
import {
  buildAuthorizationUrl,
  createOAuth2Pkce,
  exchangeAuthorizationCode,
  type OAuth2Tokens,
  refreshAccessToken,
} from "../engenty/connections-sdk/oauth2.js";
import type {
  ConnectorActionContext,
  ConnectorDefinition,
} from "../engenty/connections-sdk/types.js";
import { seal, unseal } from "../secrets/crypto.js";
import { currentTenant } from "../tenants/tenant.js";
import { builtinConnector, connectorFetch, resolveEnv, usable, viaAccount } from "./builtin.js";
import { connectRedirectUri as redirectUri } from "./index.js";
import {
  AccountConnectError,
  redeemTicket,
  refreshThroughAccount,
  startThroughAccount,
} from "./via-account.js";

/*
 * Accounts a plugin connects for a space (`server.connections`, docs/content/dev/plugins): the
 * runtime's built-in OAuth connectors, signed in through the same callback as a wizard's
 * connections, kept in `plugin_connection` rather than in a wizard's store.
 */

/** Carried through the provider as `state`, sealed. `plugin` tells it from a wizard's state. */
interface PluginOAuthState {
  plugin: string;
  tenantId: string;
  projectId: string;
  connectorId: string;
  actions: string[];
  verifier: string;
  exp: number;
}

/** What is sealed in `data`. */
interface StoredTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scopes: string[];
  via?: "account";
}

type Row = typeof schema.pluginConnection.$inferSelect;

function oauthConnector(id: string): ConnectorDefinition {
  const connector = builtinConnector(id);
  if (connector?.auth.kind !== "oauth2") {
    throw new Error(`"${id}" is not a built-in connector that signs in.`);
  }
  return connector;
}

/** The provider rights the named actions need, and the connector's own base rights. */
function scopesOf(connector: ConnectorDefinition, actions: string[]): string[] {
  const scopes = new Set(connector.auth.kind === "oauth2" ? connector.auth.oauth2.baseScopes : []);
  for (const id of actions) {
    const action = connector.actions.find((a) => a.id === id);
    if (!action) {
      throw new Error(`${connector.name} has no action "${id}".`);
    }
    for (const scope of action.providerScopes ?? []) {
      scopes.add(scope);
    }
  }
  return [...scopes];
}

const view = (row: Row): PluginConnection => ({
  id: row.id,
  space: row.projectId,
  connector: row.connector,
  label: row.label,
  actions: row.actions,
  createdAt: row.createdAt.toISOString(),
});

/** A state the callback can tell is a plugin's: the tenant to finish it in, or null. */
export function pluginStateTenant(rawState: string): string | null {
  const state = unseal<PluginOAuthState>(rawState);
  return state && typeof state.plugin === "string" ? state.tenantId : null;
}

/**
 * The provider came back for a plugin's sign-in: keeps the account. A second sign-in to the
 * same account for the same space replaces the first one's tokens.
 */
export async function finishPluginOAuth(
  answer: { code: string } | { ticket: string },
  rawState: string,
): Promise<{ plugin: string; projectId: string }> {
  const state = unseal<PluginOAuthState>(rawState);
  if (!state?.plugin || state.exp < Date.now()) {
    throw new Error("Die Anmeldung ist abgelaufen. Bitte noch einmal verbinden.");
  }
  const connector = oauthConnector(state.connectorId);
  if (connector.auth.kind !== "oauth2") {
    throw new Error("not an oauth connector");
  }
  const tokens: OAuth2Tokens =
    "ticket" in answer
      ? await redeemTicket(answer.ticket)
      : await exchangeAuthorizationCode({
          code: answer.code,
          codeVerifier: state.verifier,
          config: connector.auth.oauth2,
          redirectUri: redirectUri(),
          resolveEnv,
        });
  const account = (await connector.auth.oauth2
    .resolveAccount?.(tokens.accessToken, fetch)
    .catch(() => null)) ?? { label: connector.name };
  const stored: StoredTokens = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt?.toISOString() ?? null,
    scopes: tokens.grantedScopes,
    ...("ticket" in answer ? { via: "account" as const } : {}),
  };
  const same = await db.query.pluginConnection.findFirst({
    where: and(
      eq(schema.pluginConnection.plugin, state.plugin),
      eq(schema.pluginConnection.projectId, state.projectId),
      eq(schema.pluginConnection.connector, connector.id),
      eq(schema.pluginConnection.label, account.label),
    ),
  });
  if (same) {
    await db
      .update(schema.pluginConnection)
      .set({ actions: state.actions, data: seal(stored), updatedAt: new Date() })
      .where(eq(schema.pluginConnection.id, same.id));
  } else {
    await db.insert(schema.pluginConnection).values({
      id: nanoid(14),
      plugin: state.plugin,
      projectId: state.projectId,
      connector: connector.id,
      label: account.label,
      actions: state.actions,
      data: seal(stored),
    });
  }
  return { plugin: state.plugin, projectId: state.projectId };
}

/** The tokens of a connection, refreshed when they run out within five minutes. */
async function freshTokens(row: Row, connector: ConnectorDefinition): Promise<StoredTokens> {
  let data = unseal<StoredTokens>(row.data);
  if (!data) {
    throw new Error("The connection's keys cannot be read here. Connect the account again.");
  }
  const expires = data.expiresAt ? Date.parse(data.expiresAt) : null;
  if (
    connector.auth.kind === "oauth2" &&
    data.refreshToken &&
    expires !== null &&
    expires - Date.now() < 5 * 60_000
  ) {
    const tokens =
      data.via === "account"
        ? await refreshThroughAccount(data.refreshToken)
        : await refreshAccessToken({
            config: connector.auth.oauth2,
            refreshToken: data.refreshToken,
            resolveEnv,
          });
    data = {
      ...(data.via ? { via: data.via } : {}),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? data.refreshToken,
      expiresAt: tokens.expiresAt?.toISOString() ?? null,
      scopes: tokens.grantedScopes.length ? tokens.grantedScopes : data.scopes,
    };
    await db
      .update(schema.pluginConnection)
      .set({ data: seal(data), updatedAt: new Date() })
      .where(eq(schema.pluginConnection.id, row.id));
  }
  return data;
}

function contextOf(row: Row, connector: ConnectorDefinition, data: StoredTokens) {
  const ctx: ConnectorActionContext = {
    accessToken: data.accessToken,
    fetchImpl: connectorFetch,
    log: () => undefined,
    connection: {
      id: row.id,
      connector_id: connector.id,
      auth_kind: connector.auth.kind,
      autonomous_mode: "read_only",
      connected_by: row.createdBy,
      created_at: row.createdAt.toISOString(),
      display_name: row.label,
      error_message: null,
      external_account: row.label,
      granted_scopes: data.scopes,
      owner_user_id: null,
      space_id: row.projectId,
      status: "active",
      tenant_id: currentTenant(),
    },
  };
  return ctx;
}

/** `server.connections` of one plugin; every call runs inside the current tenant. */
export function pluginConnections(plugin: string): PluginConnections {
  const own = (id: string) =>
    db.query.pluginConnection.findFirst({
      where: and(eq(schema.pluginConnection.id, id), eq(schema.pluginConnection.plugin, plugin)),
    });

  return {
    async available(ids) {
      const out: { id: string; name: string }[] = [];
      for (const id of ids) {
        const connector = builtinConnector(id);
        if (connector?.auth.kind === "oauth2" && (await usable(connector))) {
          out.push({ id, name: connector.name });
        }
      }
      return out;
    },

    async start({ space, connector: connectorId, actions }) {
      const connector = oauthConnector(connectorId);
      if (connector.auth.kind !== "oauth2") {
        throw new Error("not an oauth connector");
      }
      const project = await db.query.project.findFirst({
        where: eq(schema.project.id, space),
        columns: { id: true },
      });
      if (!project) {
        throw new Error(`There is no space "${space}".`);
      }
      const scopes = scopesOf(connector, actions);
      const base = {
        plugin,
        tenantId: currentTenant(),
        projectId: space,
        connectorId,
        actions: [...new Set(actions)],
        exp: Date.now() + 15 * 60_000,
      };
      if (await viaAccount(connector)) {
        // The Manage-App keeps the PKCE verifier; ours stays empty.
        try {
          const url = await startThroughAccount(
            scopes,
            seal({ ...base, verifier: "" } satisfies PluginOAuthState),
            redirectUri(),
          );
          return { url };
        } catch (err) {
          throw err instanceof AccountConnectError
            ? Object.assign(new Error(err.message), { status: 409, code: "account" })
            : err;
        }
      }
      await connector.auth.oauth2.registerClient?.();
      const pkce = createOAuth2Pkce();
      const url = await buildAuthorizationUrl({
        connector,
        pkce,
        redirectUri: redirectUri(),
        scopes,
        state: seal({ ...base, verifier: pkce.codeVerifier } satisfies PluginOAuthState),
        resolveEnv,
      });
      return { url };
    },

    async list(space) {
      const rows = await db.query.pluginConnection.findMany({
        where: and(
          eq(schema.pluginConnection.plugin, plugin),
          eq(schema.pluginConnection.projectId, space),
        ),
        orderBy: [desc(schema.pluginConnection.createdAt)],
      });
      return rows.map(view);
    },

    async get(id) {
      const row = await own(id);
      return row ? view(row) : null;
    },

    async call(id, actionId, input) {
      const row = await own(id);
      if (!row) {
        throw new Error(`There is no connection "${id}".`);
      }
      if (!row.actions.includes(actionId)) {
        throw new Error(`The connection was not made for "${actionId}". Connect it again.`);
      }
      const connector = oauthConnector(row.connector);
      const action = connector.actions.find((a) => a.id === actionId);
      if (!action) {
        throw new Error(`${connector.name} has no action "${actionId}".`);
      }
      const data = await freshTokens(row, connector);
      return (await action.handler(
        action.inputSchema.parse(input) as any,
        contextOf(row, connector, data),
      )) as never;
    },

    async remove(id) {
      await db
        .delete(schema.pluginConnection)
        .where(and(eq(schema.pluginConnection.id, id), eq(schema.pluginConnection.plugin, plugin)));
    },
  };
}
