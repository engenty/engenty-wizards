import { eq } from "drizzle-orm";
import type {
  ConnectionDef,
  ConnectionKind,
  ConnectionView,
  ConnectorOption,
} from "../../shared/store.js";
import { seal, unseal } from "../crypto.js";
import { db, schema } from "../db/client.js";
import {
  buildAuthorizationUrl,
  createOAuth2Pkce,
  exchangeAuthorizationCode,
  refreshAccessToken,
} from "../engenty/connections-sdk/oauth2.js";
import {
  type ConnectorActionContext,
  type ConnectorDefinition,
  scopesForGroups,
} from "../engenty/connections-sdk/types.js";
import { env } from "../env.js";
import { deleteSecret, getSecret, putSecret, type StoreScope } from "../store/index.js";
import { connectorFetch, MAIL_CONNECTORS, resolveEnv, usable } from "./builtin.js";
import { resolveConnector } from "./external.js";

/** The connectors a person can pick for each kind of connection. */
const CONNECTORS: Record<ConnectionKind, ConnectorDefinition[]> = { mail: MAIL_CONNECTORS };

const HINTS: Record<string, string> = {
  imap: "Bei Gmail, iCloud, GMX und web.de brauchst du ein App-Passwort (in den Sicherheitseinstellungen deines Kontos), nicht dein normales Passwort.",
};

/**
 * What a connection asks the provider for: what reading needs, plus what each action the wizard
 * may use needs. A wizard that only reads never asks for the right to send or delete.
 */
function scopesFor(connection: ConnectionDef, connector: ConnectorDefinition): string[] {
  const scopes = new Set(scopesForGroups(connector, new Set(["read"] as const)));
  for (const action of connector.actions) {
    if (connection.actions?.includes(action.id)) {
      for (const scope of action.providerScopes ?? []) {
        scopes.add(scope);
      }
    }
  }
  return [...scopes];
}

/** Where the provider sends the person back; must be registered with the OAuth client. */
export function connectRedirectUri(): string {
  return env.connectRedirectUrl || `${env.appUrl}/api/connect/callback`;
}

const slot = (connectionId: string) => `connection:${connectionId}`;

/** What is stored for a connected account. `accessToken` is the credentials JSON for `api_key`. */
interface StoredConnection {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scopes: string[];
}

/** A connector that needs no credential: there is nothing for the person to connect. */
const open = (connector: ConnectorDefinition) =>
  connector.auth.kind === "api_key" && connector.auth.apiKey.fields.length === 0;

/** The connectors behind a connection: the built-in ones of its kind, or the one it names. */
async function candidates(connection: ConnectionDef, projectId: string) {
  if (connection.connector) {
    const found = await resolveConnector(projectId, connection.connector);
    return found ? [found.connector] : [];
  }
  return connection.kind ? CONNECTORS[connection.kind] : [];
}

export async function connectorOptions(
  connection: ConnectionDef,
  projectId: string,
): Promise<ConnectorOption[]> {
  const out: ConnectorOption[] = [];
  for (const c of await candidates(connection, projectId)) {
    if (!(await usable(c))) {
      continue;
    }
    out.push(
      c.auth.kind === "api_key"
        ? {
            id: c.id,
            name: c.name,
            auth: "api_key",
            fields: c.auth.apiKey.fields,
            hint: HINTS[c.id],
          }
        : { id: c.id, name: c.name, auth: "oauth2" },
    );
  }
  return out;
}

async function connectorFor(
  connection: ConnectionDef,
  connectorId: string,
  projectId: string,
): Promise<ConnectorDefinition> {
  const connector = (await candidates(connection, projectId)).find((c) => c.id === connectorId);
  if (!connector) {
    throw new Error(`Unknown connector "${connectorId}".`);
  }
  return connector;
}

export async function connectionViews(
  connections: ConnectionDef[],
  scope: StoreScope,
  projectId: string,
): Promise<ConnectionView[]> {
  return Promise.all(
    connections.map(async (c) => {
      const stored = await getSecret<StoredConnection>(scope, slot(c.id));
      const only = c.connector ? (await candidates(c, projectId))[0] : undefined;
      return {
        id: c.id,
        kind: c.kind ?? null,
        connector: c.connector ?? null,
        title: c.title ?? only?.name ?? null,
        description: c.description ?? null,
        account: stored
          ? {
              connector: stored.provider,
              label: stored.label,
              connectedAt: stored.createdAt.toISOString(),
            }
          : only && open(only)
            ? { connector: only.id, label: only.name, connectedAt: new Date(0).toISOString() }
            : null,
        connectors: await connectorOptions(c, projectId),
      };
    }),
  );
}

// --- connecting ----------------------------------------------------------------

/** Carried through the provider as `state`: sealed, so the PKCE verifier stays with us. */
interface OAuthState {
  scope: StoreScope;
  projectId: string;
  runId: string;
  connectionId: string;
  connectorId: string;
  verifier: string;
  exp: number;
}

export async function startOAuth(
  scope: StoreScope,
  projectId: string,
  runId: string,
  connection: ConnectionDef,
  connectorId: string,
): Promise<string> {
  const connector = await connectorFor(connection, connectorId, projectId);
  if (connector.auth.kind !== "oauth2") {
    throw new Error(`${connector.name} is not connected by signing in.`);
  }
  // Servers that hand out OAuth clients on request (most MCP servers): get one on first use.
  await connector.auth.oauth2.registerClient?.();
  const pkce = createOAuth2Pkce();
  const state: OAuthState = {
    scope,
    projectId,
    runId,
    connectionId: connection.id,
    connectorId,
    verifier: pkce.codeVerifier,
    exp: Date.now() + 15 * 60_000,
  };
  return buildAuthorizationUrl({
    connector,
    pkce,
    redirectUri: connectRedirectUri(),
    scopes: scopesFor(connection, connector),
    state: seal(state),
    resolveEnv,
  });
}

export async function finishOAuth(code: string, rawState: string): Promise<OAuthState> {
  const state = unseal<OAuthState>(rawState);
  if (!state || state.exp < Date.now()) {
    throw new Error("Die Anmeldung ist abgelaufen. Bitte noch einmal verbinden.");
  }
  const run = await db.query.run.findFirst({ where: eq(schema.run.id, state.runId) });
  const connection = run?.definition.connections?.find((c) => c.id === state.connectionId);
  if (!connection) {
    throw new Error("The run this sign-in belongs to is gone.");
  }
  const connector = await connectorFor(connection, state.connectorId, state.projectId);
  if (connector.auth.kind !== "oauth2") {
    throw new Error("not an oauth connector");
  }
  const tokens = await exchangeAuthorizationCode({
    code,
    codeVerifier: state.verifier,
    config: connector.auth.oauth2,
    redirectUri: connectRedirectUri(),
    resolveEnv,
  });
  // A provider that will not name the account still connected it.
  const account = (await connector.auth.oauth2
    .resolveAccount?.(tokens.accessToken, fetch)
    .catch(() => null)) ?? { label: connector.name };
  const stored: StoredConnection = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt?.toISOString() ?? null,
    scopes: tokens.grantedScopes,
  };
  await putSecret(state.scope, slot(connection.id), connector.id, account.label, stored);
  return state;
}

/** Connects an `api_key` connector with what the person typed; the connector checks it first. */
export async function connectWithCredentials(
  scope: StoreScope,
  projectId: string,
  connection: ConnectionDef,
  connectorId: string,
  values: Record<string, string>,
): Promise<string> {
  const connector = await connectorFor(connection, connectorId, projectId);
  if (connector.auth.kind !== "api_key") {
    throw new Error(`${connector.name} is connected by signing in.`);
  }
  const credentials: Record<string, string> = {};
  for (const field of connector.auth.apiKey.fields) {
    const value = String(values[field.key] ?? "").trim();
    if (!value && field.required !== false) {
      throw new ConnectError(`„${field.label}“ fehlt.`);
    }
    if (value) {
      credentials[field.key] = value.slice(0, 500);
    }
  }
  let account: { label: string };
  try {
    account = await connector.auth.apiKey.verify(credentials, connectorFetch);
  } catch (err) {
    throw new ConnectError(connectFailure(err));
  }
  const stored: StoredConnection = {
    accessToken: JSON.stringify(credentials),
    refreshToken: null,
    expiresAt: null,
    scopes: [],
  };
  await putSecret(scope, slot(connection.id), connector.id, account.label, stored);
  return account.label;
}

/** A connect attempt the person can fix (wrong password, unknown server). */
export class ConnectError extends Error {}

function connectFailure(err: unknown): string {
  const e = err as { authenticationFailed?: boolean; code?: string; message?: string };
  if (e.authenticationFailed) {
    return "Anmeldung abgelehnt. Stimmen Adresse und (App-)Passwort?";
  }
  if (e.code === "ENOTFOUND" || e.code === "ECONNREFUSED" || e.code === "ETIMEDOUT") {
    return "Der Mail-Server ist nicht erreichbar. Bitte den IMAP-Server prüfen.";
  }
  return `Verbinden hat nicht geklappt: ${String(e.message ?? err).slice(0, 200)}`;
}

export function disconnect(scope: StoreScope, connectionId: string) {
  return deleteSecret(scope, slot(connectionId));
}

// --- using ---------------------------------------------------------------------

/**
 * The connector and the context its actions run with, for a connection the person has
 * connected — with a fresh access token. `null` when nothing is connected.
 */
export async function connectionContext(
  scope: StoreScope,
  connection: ConnectionDef,
  projectId: string,
): Promise<{ connector: ConnectorDefinition; ctx: ConnectorActionContext; label: string } | null> {
  const stored = await getSecret<StoredConnection>(scope, slot(connection.id));
  if (!stored) {
    const only = connection.connector ? (await candidates(connection, projectId))[0] : undefined;
    return only && open(only)
      ? { connector: only, label: only.name, ctx: actionContext(scope, connection, only, "{}", []) }
      : null;
  }
  const connector = await connectorFor(connection, stored.provider, projectId);
  let data = stored.data;
  const expires = data.expiresAt ? Date.parse(data.expiresAt) : null;
  if (
    connector.auth.kind === "oauth2" &&
    data.refreshToken &&
    expires !== null &&
    expires - Date.now() < 5 * 60_000
  ) {
    const tokens = await refreshAccessToken({
      config: connector.auth.oauth2,
      refreshToken: data.refreshToken,
      resolveEnv,
    });
    data = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? data.refreshToken,
      expiresAt: tokens.expiresAt?.toISOString() ?? null,
      scopes: tokens.grantedScopes.length ? tokens.grantedScopes : data.scopes,
    };
    await putSecret(scope, slot(connection.id), connector.id, stored.label, data);
  }
  return {
    connector,
    label: stored.label,
    ctx: actionContext(scope, connection, connector, data.accessToken, data.scopes, stored),
  };
}

function actionContext(
  scope: StoreScope,
  connection: ConnectionDef,
  connector: ConnectorDefinition,
  accessToken: string,
  scopes: string[],
  stored?: { label: string; createdAt: Date },
): ConnectorActionContext {
  return {
    accessToken,
    fetchImpl: connectorFetch,
    log: () => undefined,
    connection: {
      id: connection.id,
      connector_id: connector.id,
      auth_kind: connector.auth.kind,
      autonomous_mode: "read_only",
      connected_by: null,
      created_at: (stored?.createdAt ?? new Date()).toISOString(),
      display_name: stored?.label ?? connector.name,
      error_message: null,
      external_account: stored?.label ?? null,
      granted_scopes: scopes,
      owner_user_id: null,
      space_id: null,
      status: "active",
      tenant_id: scope.wizardId,
    },
  };
}
