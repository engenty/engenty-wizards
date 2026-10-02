import { env } from "../env.js";

/** What an MCP client may do; the consent page lists them, tools register only when granted. */
export const SCOPES = ["wizards:read", "wizards:write", "wizards:publish", "runs:test"] as const;
export type Scope = (typeof SCOPES)[number];

/** The protected resource OAuth tokens are bound to (RFC 8707 / RFC 9728). */
export const MCP_RESOURCE = `${env.appUrl}/api/mcp`;
