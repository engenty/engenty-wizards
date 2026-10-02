import type {
  ConnectionDef,
  ConnectionKind,
  ConnectionView,
  ConnectorOption,
} from "../../shared/store.js";
import { seal, unseal } from "../crypto.js";
import {
  buildAuthorizationUrl,
  type ClientEnvResolver,
  createOAuth2Pkce,
  exchangeAuthorizationCode,
  hasOAuth2ClientCredentials,
  refreshAccessToken,
} from "../engenty/connections-sdk/oauth2.js";
import {
  type ConnectorActionContext,
  type ConnectorDefinition,
  scopesForGroups,
} from "../engenty/connections-sdk/types.js";
import { env } from "../env.js";
import { deleteSecret, getSecret, putSecret, type StoreScope } from "../store/index.js";
import { gmailConnector } from "./gmail.js";
import { imapConnector } from "./imap.js";
import { outlookConnector } from "./outlook.js";

/** The connectors a person can pick for each kind of connection. */
const CONNECTORS: Record<ConnectionKind, ConnectorDefinition[]> = {
  mail: [gmailConnector, outlookConnector, imapConnector],
};

const HINTS: Record<string, string> = {
  imap: "Bei Gmail, iCloud, GMX und web.de brauchst du ein App-Passwort (in den Sicherheitseinstellungen deines Kontos), nicht dein normales Passwort.",
};

/** A wizard only reads: connections are asked for the scopes of read actions. */
const READ = new Set(["read"] as const);

/**
 * engenty's connectors name their OAuth client `<VENDOR>_OAUTH_CLIENT_ID`; this product signs
 * people in with `<VENDOR>_CLIENT_ID`. One client can serve both, so either name works.
 */
const resolveEnv: ClientEnvResolver = async (key) =>
  process.env[key]?.trim() || process.env[key.replace("_OAUTH_", "_")]?.trim() || undefined;

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

async function usable(connector: ConnectorDefinition): Promise<boolean> {
  return connector.auth.kind === "oauth2"
    ? hasOAuth2ClientCredentials(connector.auth.oauth2, resolveEnv)
    : connector.auth.kind === "api_key";
}

export async function connectorOptions(kind: ConnectionKind): Promise<ConnectorOption[]> {
  const out: ConnectorOption[] = [];
  for (const c of CONNECTORS[kind]) {
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

function connectorFor(connection: ConnectionDef, connectorId: string): ConnectorDefinition {
  const connector = CONNECTORS[connection.kind].find((c) => c.id === connectorId);
  if (!connector) {
    throw new Error(`Unknown connector "${connectorId}".`);
  }
  return connector;
}

export async function connectionViews(
  connections: ConnectionDef[],
  scope: StoreScope,
): Promise<ConnectionView[]> {
  return Promise.all(
    connections.map(async (c) => {
      const stored = await getSecret<StoredConnection>(scope, slot(c.id));
      return {
        id: c.id,
        kind: c.kind,
        title: c.title ?? null,
        description: c.description ?? null,
        account: stored
          ? {
              connector: stored.provider,
              label: stored.label,
              connectedAt: stored.createdAt.toISOString(),
            }
          : null,
        connectors: await connectorOptions(c.kind),
      };
    }),
  );
}

// --- connecting ----------------------------------------------------------------

/** Carried through the provider as `state`: sealed, so the PKCE verifier stays with us. */
interface OAuthState {
  scope: StoreScope;
  runId: string;
  connection: ConnectionDef;
  connectorId: string;
  verifier: string;
  exp: number;
}

export async function startOAuth(
  scope: StoreScope,
  runId: string,
  connection: ConnectionDef,
  connectorId: string,
): Promise<string> {
  const connector = connectorFor(connection, connectorId);
  if (connector.auth.kind !== "oauth2") {
    throw new Error(`${connector.name} is not connected by signing in.`);
  }
  const pkce = createOAuth2Pkce();
  const state: OAuthState = {
    scope,
    runId,
    connection,
    connectorId,
    verifier: pkce.codeVerifier,
    exp: Date.now() + 15 * 60_000,
  };
  return buildAuthorizationUrl({
    connector,
    pkce,
    redirectUri: connectRedirectUri(),
    scopes: scopesForGroups(connector, READ),
    state: seal(state),
    resolveEnv,
  });
}

export async function finishOAuth(code: string, rawState: string): Promise<OAuthState> {
  const state = unseal<OAuthState>(rawState);
  if (!state || state.exp < Date.now()) {
    throw new Error("Die Anmeldung ist abgelaufen. Bitte noch einmal verbinden.");
  }
  const connector = connectorFor(state.connection, state.connectorId);
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
  const account = (await connector.auth.oauth2.resolveAccount?.(tokens.accessToken, fetch)) ?? {
    label: connector.name,
  };
  const stored: StoredConnection = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt?.toISOString() ?? null,
    scopes: tokens.grantedScopes,
  };
  await putSecret(state.scope, slot(state.connection.id), connector.id, account.label, stored);
  return state;
}

/** Connects an `api_key` connector with what the person typed; the connector checks it first. */
export async function connectWithCredentials(
  scope: StoreScope,
  connection: ConnectionDef,
  connectorId: string,
  values: Record<string, string>,
): Promise<string> {
  const connector = connectorFor(connection, connectorId);
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
    account = await connector.auth.apiKey.verify(credentials, fetch);
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
): Promise<{ connector: ConnectorDefinition; ctx: ConnectorActionContext; label: string } | null> {
  const stored = await getSecret<StoredConnection>(scope, slot(connection.id));
  if (!stored) {
    return null;
  }
  const connector = connectorFor(connection, stored.provider);
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
    ctx: {
      accessToken: data.accessToken,
      fetchImpl: fetch,
      log: () => undefined,
      connection: {
        id: connection.id,
        connector_id: connector.id,
        auth_kind: connector.auth.kind,
        autonomous_mode: "read_only",
        connected_by: null,
        created_at: stored.createdAt.toISOString(),
        display_name: stored.label,
        error_message: null,
        external_account: stored.label,
        granted_scopes: data.scopes,
        owner_user_id: null,
        space_id: null,
        status: "active",
        tenant_id: scope.wizardId,
      },
    },
  };
}
