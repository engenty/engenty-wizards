import { apiKey } from "@better-auth/api-key";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { jwt } from "better-auth/plugins";
import { db, schema } from "./db/client.js";
import { env } from "./env.js";
import { MCP_RESOURCE, SCOPES } from "./mcp/scopes.js";
import { onFirstSignIn } from "./onboarding.js";

const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};
if (env.google.id) {
  socialProviders.google = { clientId: env.google.id, clientSecret: env.google.secret };
}
if (env.github.id) {
  socialProviders.github = { clientId: env.github.id, clientSecret: env.github.secret };
}
if (env.microsoft.id) {
  socialProviders.microsoft = { clientId: env.microsoft.id, clientSecret: env.microsoft.secret };
}

export const enabledProviders = Object.keys(socialProviders);

/** RFC 8252: loopback http and custom-scheme redirects belong to native apps. */
function isNativeRedirect(uri: unknown): boolean {
  try {
    const url = new URL(String(uri));
    if (url.protocol === "https:") {
      return false;
    }
    if (url.protocol === "http:") {
      return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    }
    return true;
  } catch {
    return false;
  }
}

export const auth = betterAuth({
  baseURL: env.appUrl,
  basePath: "/api/auth",
  secret: env.authSecret,
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      apikey: schema.apikey,
      jwks: schema.jwks,
      oauthClient: schema.oauthClient,
      oauthResource: schema.oauthResource,
      oauthClientResource: schema.oauthClientResource,
      oauthRefreshToken: schema.oauthRefreshToken,
      oauthAccessToken: schema.oauthAccessToken,
      oauthConsent: schema.oauthConsent,
      oauthClientAssertion: schema.oauthClientAssertion,
    },
  }),
  socialProviders,
  // Passwords exist only for the local dev login; production signs in socially.
  emailAndPassword: { enabled: env.devLogin },
  trustedOrigins: env.production
    ? [env.appUrl]
    : [env.appUrl, "http://localhost:5181", "http://127.0.0.1:5181"],
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  plugins: [
    // Personal keys for MCP clients and scripts. They only open /api/mcp, never a studio session.
    apiKey({
      enableSessionForAPIKeys: false,
      rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 300 },
    }),
    // Signs the OAuth access tokens; /api/mcp verifies them against its JWKS.
    jwt(),
    // OAuth 2.1 for MCP clients: discovery, registration, sign-in, consent, tokens bound to /api/mcp.
    mcp({
      loginPage: "/sign-in",
      consentPage: "/consent",
      resource: MCP_RESOURCE,
      scopes: ["openid", "profile", "email", "offline_access", ...SCOPES],
      // MCP clients register themselves (RFC 7591) when they bring no metadata document.
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
    }),
    // Clients that identify by a metadata URL (the MCP 2026-07-28 registration profile).
    cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
  ],
  hooks: {
    // Newer MCP clients declare `application_type: "native"` for loopback redirects (SEP-837);
    // older ones leave it out and would be refused as web clients without https.
    before: createAuthMiddleware(async (ctx) => {
      const body = ctx.body as { application_type?: string; redirect_uris?: unknown } | undefined;
      const uris = body?.redirect_uris;
      if (
        ctx.path === "/oauth2/register" &&
        body &&
        !body.application_type &&
        Array.isArray(uris) &&
        uris.length > 0 &&
        uris.every(isNativeRedirect)
      ) {
        return { context: { body: { ...body, application_type: "native" } } };
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        after: async (created) => {
          await onFirstSignIn(created.id, created.name);
        },
      },
    },
  },
});

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

export async function sessionUser(headers: Headers): Promise<SessionUser | null> {
  const result = await auth.api.getSession({ headers });
  return result?.user ?? null;
}
