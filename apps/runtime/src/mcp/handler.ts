import {
  createMcpHandler,
  McpServer,
  originValidationResponse,
} from "@modelcontextprotocol/server";
import { withTenant } from "../db/client.js";
import { env } from "../env.js";
import { tenantStatus } from "../tenants/control.js";
import { authenticate, principalOf } from "./auth.js";
import { registerPrompts, registerTools } from "./tools.js";

const INSTRUCTIONS = `engenty wizards: build page-by-page AI wizards that people open on a shared link.
Start with get_authoring_guide (schema + design rules), look at a close starter with get_starter, then create_wizard and refine with edit_wizard until "issues" is empty.
Check it with start_test_run + get_test_run (waitSeconds) — test runs spend the admin's credits.
Publish only when the admin asks. Hand the admin the studioUrl: the studio shows the wizard as a diagram.`;

/** A wizard definition is a few KB; this leaves room and refuses anything far beyond it. */
const MAX_BODY_BYTES = 300_000;

/**
 * Streamable HTTP MCP endpoint, stateless: every request authenticates — with an access token of
 * the Manage-App or an API key — and gets a fresh server whose tools act as that admin, in the
 * tenant the token or key names.
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

  return async (request) => {
    const rejected = originValidationResponse(request, allowedHosts);
    if (rejected) {
      return rejected;
    }
    const authInfo = await authenticate(request);
    if (authInfo instanceof Response) {
      return authInfo;
    }
    const who = principalOf(authInfo);
    if ((await tenantStatus(who.tenantId)) === "suspended") {
      return new Response(JSON.stringify({ error: "tenant_suspended" }), { status: 403 });
    }
    return withTenant(who.tenantId, () => handler.fetch(request, { authInfo }));
  };
}
