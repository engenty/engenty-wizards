import type { AuthInfo } from "@modelcontextprotocol/server";
import { API_KEY_PREFIX, verifyLocalKey } from "../auth/keys.js";
import { env } from "../env.js";
import { managed, verifyKey, verifyToken } from "../manage.js";
import { LOCAL_TENANT } from "../tenant.js";
import { MCP_RESOURCE, SCOPES, type Scope } from "./scopes.js";

/** The admin an MCP request acts for, their tenant, and the client acting (shown in the studio thread). */
export interface Principal {
  userId: string;
  tenantId: string;
  client: string;
  scopes: Scope[];
}

export function principalOf(info: AuthInfo): Principal {
  return info.extra as unknown as Principal;
}

function authInfoFor(who: Principal, token: string, clientId: string): AuthInfo {
  return { token, clientId, scopes: who.scopes, extra: { ...who } };
}

function bearer(request: Request): string | null {
  return (
    request.headers
      .get("authorization")
      ?.match(/^Bearer\s+(.+)$/i)?.[1]
      ?.trim() || null
  );
}

const resourceMetadataUrl = (() => {
  const url = new URL(MCP_RESOURCE);
  return `${url.origin}/.well-known/oauth-protected-resource${url.pathname}`;
})();

/** RFC 6750 / RFC 9728 challenge: tells an MCP client where to start OAuth. */
function challenge(status: 401 | 429, error: string, description: string): Response {
  return new Response(JSON.stringify({ error, error_description: description }), {
    status,
    headers: {
      "content-type": "application/json",
      ...(status === 401
        ? {
            "www-authenticate": managed
              ? `Bearer error="${error}", error_description="${description}", resource_metadata="${resourceMetadataUrl}", scope="${SCOPES.join(" ")}"`
              : `Bearer error="${error}", error_description="${description}"`,
          }
        : {}),
    },
  });
}

const keyCache = new Map<string, { at: number; who: Principal; keyId: string }>();

/** An API key acts as its owner, in the key's tenant, with every scope. */
async function apiKeyAuth(key: string): Promise<AuthInfo | Response> {
  if (!managed) {
    const found = await verifyLocalKey(key);
    if (!found) {
      return challenge(401, "invalid_token", "This API key is unknown or revoked.");
    }
    const who: Principal = {
      userId: "local",
      tenantId: LOCAL_TENANT,
      client: found.name || "MCP",
      scopes: [...SCOPES],
    };
    return authInfoFor(who, key, found.id);
  }
  const hit = keyCache.get(key);
  if (hit && Date.now() - hit.at < 60_000) {
    return authInfoFor(hit.who, key, hit.keyId);
  }
  const result = await verifyKey(key).catch(() => null);
  if (!result?.valid || !result.userId || !result.tenantId) {
    keyCache.delete(key);
    return challenge(401, "invalid_token", "This API key is unknown or revoked.");
  }
  const who: Principal = {
    userId: result.userId,
    tenantId: result.tenantId,
    client: result.name || "MCP",
    scopes: [...SCOPES],
  };
  keyCache.set(key, { at: Date.now(), who, keyId: result.keyId ?? "" });
  return authInfoFor(who, key, result.keyId ?? "");
}

/** An access token of the Manage-App, issued for this MCP endpoint, acts within its scopes. */
async function tokenAuth(token: string): Promise<AuthInfo | Response> {
  if (!managed) {
    return challenge(401, "invalid_token", "Sign in with an API key from the settings.");
  }
  const claims = await verifyToken(token, [MCP_RESOURCE, env.appUrl]);
  if (!claims) {
    return challenge(401, "invalid_token", "The access token is invalid or expired.");
  }
  const granted = new Set(claims.scopes);
  const who: Principal = {
    userId: claims.userId,
    tenantId: claims.tenantId,
    client: claims.clientId || "MCP",
    scopes: SCOPES.filter((s) => granted.has(s)),
  };
  return authInfoFor(who, token, claims.clientId);
}

/** Who an MCP or API request acts for: an API key (`x-api-key` or a `wz_…` bearer) or an OAuth access token. */
export async function authenticate(request: Request): Promise<AuthInfo | Response> {
  const header = request.headers.get("x-api-key")?.trim();
  const token = bearer(request);
  const key = header || (token?.startsWith(API_KEY_PREFIX) ? token : null);
  if (key) {
    return apiKeyAuth(key);
  }
  if (!token) {
    return challenge(401, "invalid_token", "Sign in to use this endpoint.");
  }
  return tokenAuth(token);
}
