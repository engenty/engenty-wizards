import type { AuthInfo } from "@modelcontextprotocol/server";
import { and, eq } from "drizzle-orm";
import { auth } from "../auth.js";
import { db, schema } from "../db/client.js";
import { MCP_RESOURCE, SCOPES, type Scope } from "./scopes.js";

/** The admin an MCP request acts for, and the client acting (shown in the studio thread). */
export interface Principal {
  userId: string;
  client: string;
  scopes: Scope[];
}

export function principalOf(info: AuthInfo): Principal {
  return info.extra as unknown as Principal;
}

export function authInfoFor(who: Principal, token: string, clientId: string): AuthInfo {
  return { token, clientId, scopes: who.scopes, extra: { ...who } };
}

const API_KEY_PREFIX = "wz_";

function bearer(request: Request): string | null {
  return (
    request.headers
      .get("authorization")
      ?.match(/^Bearer\s+(.+)$/i)?.[1]
      ?.trim() || null
  );
}

/** A personal API key from the settings, as `x-api-key` or a `wz_…` bearer token. */
export function presentedApiKey(request: Request): string | null {
  const header = request.headers.get("x-api-key")?.trim();
  if (header) {
    return header;
  }
  const token = bearer(request);
  return token?.startsWith(API_KEY_PREFIX) ? token : null;
}

const resourceMetadataUrl = (() => {
  const url = new URL(MCP_RESOURCE);
  return `${url.origin}/.well-known/oauth-protected-resource${url.pathname}`;
})();

/** RFC 6750 / RFC 9728 challenge: tells an MCP client where to start OAuth. */
export function challenge(status: 401 | 429, error: string, description: string): Response {
  return new Response(JSON.stringify({ error, error_description: description }), {
    status,
    headers: {
      "content-type": "application/json",
      ...(status === 401
        ? {
            "www-authenticate": `Bearer error="${error}", error_description="${description}", resource_metadata="${resourceMetadataUrl}", scope="${SCOPES.join(" ")}"`,
          }
        : {}),
    },
  });
}

/** An API key acts as its owner with every scope. */
export async function apiKeyAuth(key: string): Promise<AuthInfo | Response> {
  const result = await auth.api.verifyApiKey({ body: { key } });
  if (!result.valid || !result.key) {
    if (/rate/i.test(result.error?.code ?? "")) {
      return challenge(429, "rate_limited", "Too many requests. Wait a minute.");
    }
    return challenge(401, "invalid_token", "This API key is unknown or revoked.");
  }
  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, result.key.referenceId),
  });
  if (!user) {
    return challenge(401, "invalid_token", "This API key has no user.");
  }
  const who: Principal = { userId: user.id, client: result.key.name || "MCP", scopes: [...SCOPES] };
  return authInfoFor(who, key, result.key.id);
}

/**
 * A verified OAuth access token acts as its user within the granted scopes — while the
 * consent stands, so "Trennen" in the settings cuts a client off at once.
 */
export async function oauthAuth(
  claims: Record<string, unknown>,
  token: string,
): Promise<AuthInfo | Response> {
  const userId = typeof claims.sub === "string" ? claims.sub : null;
  const clientId =
    typeof claims.azp === "string"
      ? claims.azp
      : typeof claims.client_id === "string"
        ? claims.client_id
        : null;
  if (!userId || !clientId) {
    return challenge(401, "invalid_token", "The token names no user or client.");
  }
  const consent = await db.query.oauthConsent.findFirst({
    where: and(eq(schema.oauthConsent.userId, userId), eq(schema.oauthConsent.clientId, clientId)),
  });
  if (!consent) {
    return challenge(401, "invalid_token", "This connection was removed. Sign in again.");
  }
  const client = await db.query.oauthClient.findFirst({
    where: eq(schema.oauthClient.clientId, clientId),
  });
  const granted = new Set(String(claims.scope ?? "").split(" "));
  const who: Principal = {
    userId,
    client: client?.name || "MCP",
    scopes: SCOPES.filter((s) => granted.has(s)),
  };
  return authInfoFor(who, token, clientId);
}
