import { mkdtempSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import {
  Client,
  type OAuthClientProvider,
  StreamableHTTPClientTransport,
  UnauthorizedError,
} from "@modelcontextprotocol/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = createServer().listen(0, () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

const port = await freePort();
const origin = `http://localhost:${port}`;
const dir = mkdtempSync(join(tmpdir(), "wizards-oauth-"));
process.env.DATA_DIR = dir;
process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
process.env.APP_URL = origin;
process.env.API_PORT = String(port);
process.env.DEV_LOGIN = "1";

let close: () => void;
let cookie: string;

/** An MCP client's OAuth state, in memory, as a desktop client would keep it. */
class MemoryProvider implements OAuthClientProvider {
  info?: any;
  stored?: any;
  verifier = "";
  authorizationUrl?: URL;
  get redirectUrl() {
    return "http://127.0.0.1:43123/callback";
  }
  get clientMetadata() {
    return {
      client_name: "Test Client",
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }
  clientInformation() {
    return this.info;
  }
  saveClientInformation(info: any) {
    this.info = info;
  }
  tokens() {
    return this.stored;
  }
  saveTokens(tokens: any) {
    this.stored = tokens;
  }
  redirectToAuthorization(url: URL) {
    this.authorizationUrl = url;
  }
  saveCodeVerifier(v: string) {
    this.verifier = v;
  }
  codeVerifier() {
    return this.verifier;
  }
}

function transport(provider: MemoryProvider) {
  return new StreamableHTTPClientTransport(new URL(`${origin}/api/mcp`), {
    authProvider: provider,
  });
}

/** What the admin does in the browser: open the authorize URL signed in, then allow. */
async function approve(authorizationUrl: URL, scope?: string): Promise<URLSearchParams> {
  // A browser navigation gets a 302; fetch cannot claim to navigate and gets the target as JSON.
  const res = await fetch(authorizationUrl, { headers: { cookie }, redirect: "manual" });
  const target =
    res.status === 302 ? res.headers.get("location") : ((await res.json()) as { url: string }).url;
  const consent = new URL(target ?? "", origin);
  expect(consent.pathname).toBe("/consent");
  const decided = await fetch(`${origin}/api/auth/oauth2/consent`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ accept: true, scope, oauth_query: consent.search.slice(1) }),
  });
  const body = (await decided.json()) as { url?: string; redirect_uri?: string };
  const back = new URL(body.url ?? body.redirect_uri ?? "");
  expect(back.searchParams.get("code")).toBeTruthy();
  return back.searchParams;
}

async function connected(provider: MemoryProvider, scope?: string): Promise<Client> {
  const first = new Client({ name: "test", version: "1.0.0" });
  const t1 = transport(provider);
  await expect(first.connect(t1)).rejects.toBeInstanceOf(UnauthorizedError);
  expect(provider.authorizationUrl).toBeDefined();
  await t1.finishAuth(await approve(provider.authorizationUrl!, scope));
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(transport(provider));
  return client;
}

beforeAll(async () => {
  const { migrateDb } = await import("../server/db/client");
  await migrateDb();
  const { auth } = await import("../server/auth");
  await auth.api.signUpEmail({
    body: { email: "oauth@test.local", password: "a-long-test-password", name: "OAuth Admin" },
  });
  const signIn = await auth.api.signInEmail({
    body: { email: "oauth@test.local", password: "a-long-test-password" },
    asResponse: true,
  });
  cookie = signIn.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const app = (await import("../server/app")).default;
  const server = serve({ fetch: app.fetch, port });
  close = () => server.close();
}, 60_000);

afterAll(() => close?.());

describe("OAuth for MCP clients", () => {
  it("publishes discovery metadata bound to /api/mcp", async () => {
    const prm = await fetch(`${origin}/.well-known/oauth-protected-resource/api/mcp`).then((r) =>
      r.json(),
    );
    expect(prm.resource).toBe(`${origin}/api/mcp`);
    const as = await fetch(
      `${origin}/.well-known/oauth-authorization-server/api/auth`,
    ).then((r) => r.json());
    expect(as.issuer).toBe(prm.authorization_servers[0]);
    expect(as.registration_endpoint).toBeTruthy();
  });

  it("registers, signs in, consents and gets the tools; disconnecting cuts it off", async () => {
    const provider = new MemoryProvider();
    const client = await connected(provider);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("create_wizard");
    const created = await client.callTool({
      name: "create_wizard",
      arguments: { note: "Über OAuth angelegt." },
    });
    expect(created.isError).toBeFalsy();

    const { db, schema } = await import("../server/db/client");
    const notes = await db.select().from(schema.wizardMessage);
    expect(notes.map((n) => [n.source, n.client])).toContainEqual(["mcp", "Test Client"]);

    const list = await fetch(`${origin}/api/studio/connections`, { headers: { cookie } }).then(
      (r) => r.json(),
    );
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Test Client");

    const removed = await fetch(
      `${origin}/api/studio/connections/${encodeURIComponent(list[0].clientId)}`,
      { method: "DELETE", headers: { cookie } },
    );
    expect(removed.status).toBe(200);
    await expect(client.listTools()).rejects.toThrow();
  });

  it("gives only the tools of the scopes the admin allowed", async () => {
    const provider = new MemoryProvider();
    const client = await connected(provider, "wizards:read");
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain("get_wizard");
    expect(names).not.toContain("create_wizard");
    expect(names).not.toContain("start_test_run");
  });
});
