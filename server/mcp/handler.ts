import { requireMcpAuth } from "@better-auth/mcp";
import {
  createMcpHandler,
  McpServer,
  originValidationResponse,
} from "@modelcontextprotocol/server";
import { auth } from "../auth.js";
import { env } from "../env.js";
import { apiKeyAuth, oauthAuth, presentedApiKey, principalOf } from "./auth.js";
import { MCP_RESOURCE, SCOPES } from "./scopes.js";
import { registerPrompts, registerTools } from "./tools.js";

const INSTRUCTIONS = `engenty wizards: build page-by-page AI wizards that people open on a shared link.
Start with get_authoring_guide (schema + design rules), look at a close starter with get_starter, then create_wizard and refine with edit_wizard until "issues" is empty.
Check it with start_test_run + get_test_run (waitSeconds) — test runs spend the admin's credits.
Publish only when the admin asks. Hand the admin the studioUrl: the studio shows the wizard as a diagram.`;

/** A wizard definition is a few KB; this leaves room and refuses anything far beyond it. */
const MAX_BODY_BYTES = 300_000;

/**
 * Streamable HTTP MCP endpoint, stateless: every request authenticates — with an OAuth access
 * token or a personal API key — and gets a fresh server whose tools act as that admin.
 */
export function mcpHandler(): (request: Request) => Promise<Response> {
  const allowedHosts = [new URL(env.appUrl).hostname, "localhost", "127.0.0.1"];
  const handler = createMcpHandler(
    (ctx) => {
      const server = new McpServer(
        { name: "engenty-wizards", version: "0.1.0" },
        { instructions: INSTRUCTIONS, capabilities: { tools: {}, prompts: {} } },
      );
      const who = principalOf(ctx.authInfo!);
      registerTools(server, who);
      registerPrompts(server);
      return server;
    },
    { legacy: "stateless", maxRequestBodySize: MAX_BODY_BYTES },
  );

  // Tokens are verified against our own JWKS, fetched over loopback: the public origin may sit
  // behind a proxy or a certificate this process does not trust.
  const oauth = requireMcpAuth(
    auth,
    async (request, claims) => {
      const token = request.headers.get("authorization")?.replace(/^\S+\s+/, "") ?? "";
      const authInfo = await oauthAuth(claims, token);
      return authInfo instanceof Response ? authInfo : handler.fetch(request, { authInfo });
    },
    {
      resource: MCP_RESOURCE,
      jwksUrl: `http://127.0.0.1:${env.port}/api/auth/jwks`,
      challengeScopes: SCOPES,
    },
  );

  return async (request) => {
    const rejected = originValidationResponse(request, allowedHosts);
    if (rejected) {
      return rejected;
    }
    const key = presentedApiKey(request);
    if (!key) {
      return oauth(request);
    }
    const authInfo = await apiKeyAuth(key);
    return authInfo instanceof Response ? authInfo : handler.fetch(request, { authInfo });
  };
}
