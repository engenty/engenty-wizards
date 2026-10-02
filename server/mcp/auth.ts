import type { AuthInfo } from "@modelcontextprotocol/server";
import { eq } from "drizzle-orm";
import { auth } from "../auth.js";
import { db, schema } from "../db/client.js";

export const SCOPES = ["wizards:read", "wizards:write", "wizards:publish", "runs:test"] as const;
export type Scope = (typeof SCOPES)[number];

/** The admin an MCP request acts for, and the client they connected (named after its key). */
export interface Principal {
  userId: string;
  client: string;
  scopes: Scope[];
}

export function principalOf(info: AuthInfo): Principal {
  return info.extra as unknown as Principal;
}

function challenge(status: 401 | 429, error: string, description: string): Response {
  return new Response(JSON.stringify({ error, error_description: description }), {
    status,
    headers: {
      "content-type": "application/json",
      ...(status === 401
        ? { "www-authenticate": `Bearer realm="engenty-wizards", error="${error}"` }
        : {}),
    },
  });
}

function presentedKey(request: Request): string | null {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  return bearer?.trim() || request.headers.get("x-api-key")?.trim() || null;
}

/** A personal API key (Settings → connect) acts as its owner with every scope. */
export async function authenticate(request: Request): Promise<AuthInfo | Response> {
  const key = presentedKey(request);
  if (!key) {
    return challenge(401, "invalid_token", "Send your engenty wizards API key as a Bearer token.");
  }
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
  const principal: Principal = {
    userId: user.id,
    client: result.key.name || "MCP",
    scopes: [...SCOPES],
  };
  return {
    token: key,
    clientId: result.key.id,
    scopes: principal.scopes,
    extra: { ...principal },
  };
}
