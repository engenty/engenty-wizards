import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose";
import { env } from "./env.js";

/**
 * The Manage-App as this runtime sees it (docs/manage-contract.md): it issues the tokens,
 * knows the tenants and their credits. Nothing here runs when `MANAGE_URL` is empty.
 */
export const managed = Boolean(env.manage.url);

export type Role = "owner" | "admin" | "member";

export interface TokenClaims {
  userId: string;
  tenantId: string;
  role: Role;
  name: string;
  email: string;
  clientId: string;
  scopes: string[];
  expiresAt: number;
}

interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  revocation_endpoint?: string;
  registration_endpoint?: string;
}

const discoveries = new Map<string, { at: number; value: Discovery }>();

/** OIDC discovery of a Manage-App, cached for an hour. */
export async function discovery(base = env.manage.url): Promise<Discovery> {
  const hit = discoveries.get(base);
  if (hit && Date.now() - hit.at < 3600_000) {
    return hit.value;
  }
  const res = await fetch(`${base}/.well-known/openid-configuration`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Manage-App discovery failed: ${res.status}`);
  }
  const value = (await res.json()) as Discovery;
  discoveries.set(base, { at: Date.now(), value });
  return value;
}

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function toClaims(payload: JWTPayload): TokenClaims | null {
  const p = payload as JWTPayload & Record<string, unknown>;
  if (typeof p.sub !== "string" || typeof p.tenant !== "string") {
    return null;
  }
  const role = p.role === "owner" || p.role === "admin" ? p.role : "member";
  return {
    userId: p.sub,
    tenantId: p.tenant,
    role,
    name: typeof p.name === "string" ? p.name : "",
    email: typeof p.email === "string" ? p.email : "",
    clientId: typeof p.azp === "string" ? p.azp : String(p.client_id ?? ""),
    scopes: String(p.scope ?? "")
      .split(" ")
      .filter(Boolean),
    expiresAt: (p.exp ?? 0) * 1000,
  };
}

/**
 * Verifies an access token of the Manage-App against its JWKS — no round trip per request.
 * `audiences` are the resources this caller accepts; null skips the audience check.
 */
export async function verifyToken(
  token: string,
  audiences: string[] | null,
  base = env.manage.url,
): Promise<TokenClaims | null> {
  try {
    const d = await discovery(base);
    let keys = keySets.get(d.jwks_uri);
    if (!keys) {
      keys = createRemoteJWKSet(new URL(d.jwks_uri));
      keySets.set(d.jwks_uri, keys);
    }
    const { payload } = await jwtVerify(token, keys, {
      issuer: d.issuer,
      ...(audiences ? { audience: audiences } : {}),
    });
    return toClaims(payload);
  } catch {
    return null;
  }
}

/** Reads a token's claims without verifying it — only for tokens the token endpoint just handed us. */
export function unverifiedClaims(token: string): TokenClaims | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return toClaims(payload);
  } catch {
    return null;
  }
}

// --- service calls -----------------------------------------------------------

export class ManageError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${env.manage.url}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${env.manage.serviceKey}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!res.ok) {
    throw new ManageError(
      res.status,
      data.code ?? "error",
      data.error ?? `Manage-App ${res.status}`,
    );
  }
  return data as T;
}

export interface TenantInfo {
  id: string;
  name: string;
  status: "active" | "suspended" | "deleted";
  balanceCredits: number;
  limits: { concurrentRuns: number; projects?: number };
  /** Ids of the plugins switched on for the tenant, besides the runtime's `PLUGINS_DEFAULT`. */
  modules?: string[];
  db: { url: string } | null;
}

const tenants = new Map<string, { at: number; value: TenantInfo }>();

/** Plan, limits and balance of a tenant, cached for a minute. */
export async function tenantInfo(id: string, fresh = false): Promise<TenantInfo> {
  const hit = tenants.get(id);
  if (!fresh && hit && Date.now() - hit.at < 60_000) {
    return hit.value;
  }
  const value = await call<TenantInfo>("GET", `/v1/tenants/${encodeURIComponent(id)}`);
  tenants.set(id, { at: Date.now(), value });
  return value;
}

export function forgetTenant(id: string) {
  tenants.delete(id);
}

export interface KeyInfo {
  valid: boolean;
  keyId?: string;
  name?: string;
  userId?: string;
  userName?: string;
  tenantId?: string;
  role?: Role;
}

export function verifyKey(key: string): Promise<KeyInfo> {
  return call<KeyInfo>("POST", "/v1/keys/verify", { key });
}

export function reserve(tenantId: string, runId: string, credits: number) {
  return call<{ id: string }>("POST", "/v1/reservations", { tenantId, runId, credits });
}

export function release(runId: string) {
  return call<{ ok: boolean }>("POST", "/v1/reservations/release", { runId });
}

export function runUsage(tenantId: string, runId: string) {
  return call<{ credits: number; steps: Record<string, number> }>(
    "GET",
    `/v1/runs/${encodeURIComponent(runId)}/usage?tenantId=${encodeURIComponent(tenantId)}`,
  );
}

export function bookUsage(input: {
  tenantId: string;
  runId?: string;
  stepId?: string;
  kind: string;
  usd: number;
  idempotencyKey: string;
}) {
  return call<{ credits: number }>("POST", "/v1/usage", input);
}

/** A push to the mobile app on one device; the Manage-App holds the APNs and FCM keys. */
export function pushToDevice(input: {
  tenantId: string;
  device: { token: string; platform: "ios" | "android" };
  title: string;
  body: string;
  data: Record<string, string>;
}) {
  return call<{ ok: boolean }>("POST", "/v1/push", input);
}

// --- token endpoint ----------------------------------------------------------

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

/** Code or refresh token → tokens. A confidential client sends its secret, a public one only its id. */
export async function tokenRequest(
  params: Record<string, string>,
  client: { id: string; secret?: string },
  base = env.manage.url,
): Promise<TokenSet> {
  const d = await discovery(base);
  const body = new URLSearchParams({ ...params, client_id: client.id });
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (client.secret) {
    headers.authorization = `Basic ${Buffer.from(`${encodeURIComponent(client.id)}:${encodeURIComponent(client.secret)}`).toString("base64")}`;
  }
  const res = await fetch(d.token_endpoint, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as TokenSet & { error?: string };
  if (!res.ok || !data.access_token) {
    throw new ManageError(res.status, data.error ?? "token_error", "Token request failed");
  }
  return data;
}
