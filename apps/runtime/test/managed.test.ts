import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// A stand-in Manage-App: OIDC discovery, JWKS, a token endpoint and the /v1 API of the contract.
const { publicKey, privateKey } = await generateKeyPair("ES256");
const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "ES256", use: "sig" };

const RUNTIME = "http://localhost:5181";
const SERVICE_KEY = "wzr_test_service_key";
const balances: Record<string, number> = { "tenant-a": 500, "tenant-b": 0 };
const reservations: { tenantId: string; runId: string; credits: number }[] = [];
let issuer = "";

function token(claims: Record<string, unknown>, aud: string) {
  return new SignJWT({ scope: "openid wizards:read wizards:write wizards:publish runs:test", ...claims })
    .setProtectedHeader({ alg: "ES256", kid: "k1" })
    .setIssuer(issuer)
    .setAudience(aud)
    .setExpirationTime("10m")
    .sign(privateKey);
}

const manage: Server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", issuer);
  const json = (body: unknown, status = 200) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
  }
  if (url.pathname === "/.well-known/openid-configuration") {
    return json({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      jwks_uri: `${issuer}/jwks`,
    });
  }
  if (url.pathname === "/jwks") {
    return json({ keys: [jwk] });
  }
  if (url.pathname === "/token") {
    const form = new URLSearchParams(raw);
    const who = form.get("code") === "code-b" ? "b" : "a";
    return json({
      access_token: await token(
        { sub: `user-${who}`, tenant: `tenant-${who}`, role: "owner", name: `User ${who.toUpperCase()}`, email: `${who}@test.local`, azp: "wizards-runtime-test" },
        form.get("resource") ?? RUNTIME,
      ),
      refresh_token: `refresh-${who}`,
      expires_in: 600,
    });
  }
  if (req.headers.authorization !== `Bearer ${SERVICE_KEY}`) {
    return json({ error: "unauthorized", code: "unauthorized" }, 401);
  }
  const tenant = url.pathname.match(/^\/v1\/tenants\/([^/]+)$/)?.[1];
  if (tenant) {
    return json({
      id: tenant,
      name: tenant,
      status: "active",
      balanceCredits: balances[tenant] ?? 0,
      limits: { concurrentRuns: 2 },
      // The plugins this tenant has switched on, besides the runtime's PLUGINS_DEFAULT.
      ...(tenant === "tenant-a" ? { modules: ["teams", "not-installed"] } : {}),
      db: null,
    });
  }
  if (url.pathname === "/v1/keys/verify") {
    const { key } = JSON.parse(raw);
    return json(
      key === "wz_key_of_b"
        ? { valid: true, keyId: "kb", name: "Script", userId: "user-b", userName: "User B", tenantId: "tenant-b", role: "owner" }
        : { valid: false },
    );
  }
  if (url.pathname === "/v1/reservations") {
    const body = JSON.parse(raw);
    reservations.push(body);
    return json({ id: `res-${reservations.length}` });
  }
  if (url.pathname === "/v1/reservations/release") {
    return json({ ok: true });
  }
  if (url.pathname.startsWith("/v1/runs/")) {
    return json({ credits: 0, steps: {} });
  }
  return json({ error: "not found", code: "not_found" }, 404);
});
await new Promise<void>((r) => manage.listen(0, "127.0.0.1", r));
issuer = `http://127.0.0.1:${(manage.address() as AddressInfo).port}`;

const dir = mkdtempSync(join(tmpdir(), "wizards-managed-"));
process.env.DATA_DIR = dir;
process.env.APP_URL = RUNTIME;
process.env.MANAGE_URL = issuer;
process.env.GATEWAY_URL = issuer;
process.env.MANAGE_CLIENT_ID = "wizards-runtime-test";
process.env.MANAGE_CLIENT_SECRET = "secret";
process.env.MANAGE_SERVICE_KEY = SERVICE_KEY;

// Three plugins: one every tenant has, one the Manage-App lists for tenant A, one nobody has.
const plugins = join(dir, "plugins");
mkdirSync(plugins);
for (const id of ["basics", "teams", "spaces"]) {
  writeFileSync(
    join(plugins, `${id}.ts`),
    `export default (wizards: any) => {
  wizards.server.registerHttpRoute({ method: "GET", path: "/", handler: ({ user }: any) => ({ plugin: "${id}", tenant: user.tenantId }) });
};
`,
  );
}
process.env.PLUGINS_DIR = plugins;
process.env.PLUGINS_DEFAULT = "basics";
process.env.PLUGINS_WATCH = "0";

type App = { fetch: (req: Request) => Response | Promise<Response> };
let app: App;

const cookieOf = (res: Response, name: string) =>
  res.headers
    .getSetCookie()
    .find((c) => c.startsWith(`${name}=`))
    ?.split(";")[0] ?? "";

/** Walks the sign-in a browser would: /login → (Manage-App) → /callback → session cookie. */
async function signIn(code: string): Promise<string> {
  const login = await app.fetch(new Request(`${RUNTIME}/api/auth/login?return=/settings`));
  expect(login.status).toBe(302);
  const authorize = new URL(login.headers.get("location") ?? "");
  expect(authorize.origin).toBe(issuer);
  expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
  expect(authorize.searchParams.get("resource")).toBe(RUNTIME);
  const callback = await app.fetch(
    new Request(
      `${RUNTIME}/api/auth/callback?code=${code}&state=${authorize.searchParams.get("state")}`,
      { headers: { cookie: cookieOf(login, "wz_oauth") } },
    ),
  );
  expect(callback.status).toBe(302);
  expect(callback.headers.get("location")).toBe("/settings");
  return cookieOf(callback, "wz_session");
}

const get = (path: string, cookie: string) =>
  app.fetch(new Request(`${RUNTIME}${path}`, { headers: { cookie } }));
const post = (path: string, cookie: string, body: unknown) =>
  app.fetch(
    new Request(`${RUNTIME}${path}`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeAll(async () => {
  const client = await import("../src/db/client");
  await client.migrateControlDb();
  await (await import("../src/plugins/loader")).loadPlugins();
  app = (await import("../src/app")).default;
}, 60_000);

afterAll(() => manage.close());

describe("a runtime of a Manage-App", () => {
  let a = "";
  let b = "";
  let wizardOfA = "";

  it("signs people in there and takes user, tenant and role from the token", async () => {
    a = await signIn("code-a");
    b = await signIn("code-b");
    const me = (await (await get("/api/studio/me", a)).json()) as any;
    expect(me).toMatchObject({
      user: { id: "user-a", name: "User A" },
      tenant: { id: "tenant-a", role: "owner" },
      mode: "managed",
      credits: 500,
      manageUrl: issuer,
    });
    expect((await get("/api/studio/me", "")).status).toBe(401);
  });

  it("gives each tenant its own studio", async () => {
    const [project] = (await (await get("/api/studio/projects", a)).json()) as { id: string }[];
    const created = await post("/api/studio/wizards", a, { projectId: project.id });
    wizardOfA = ((await created.json()) as { id: string }).id;
    expect((await get(`/api/studio/wizards/${wizardOfA}`, a)).status).toBe(200);
    // The other tenant's session finds nothing under that id, and lists none.
    expect((await get(`/api/studio/wizards/${wizardOfA}`, b)).status).toBe(404);
    const [projectB] = (await (await get("/api/studio/projects", b)).json()) as { id: string; wizardCount: number }[];
    expect(projectB.id).not.toBe(project.id);
    expect(projectB.wizardCount).toBe(0);
  });

  it("gives a tenant the plugins switched on for it, and never reloads one", async () => {
    const listed = async (cookie: string) =>
      ((await (await get("/api/studio/plugins", cookie)).json()) as { plugins: { id: string }[]; canReload: boolean });
    const ofA = await listed(a);
    expect(ofA.plugins.map((p) => p.id).sort()).toEqual(["basics", "teams"]);
    expect(ofA.canReload).toBe(false);
    expect((await listed(b)).plugins.map((p) => p.id)).toEqual(["basics"]);
    expect(await (await get("/api/studio/plugins/teams", a)).json()).toEqual({
      plugin: "teams",
      tenant: "tenant-a",
    });
    expect((await get("/api/studio/plugins/teams", b)).status).toBe(404);
    expect((await get("/api/studio/plugins/spaces", a)).status).toBe(404);
    expect((await get("/api/studio/plugins/basics", b)).status).toBe(200);
    // A reload would hit every tenant of the runtime.
    expect((await post("/api/studio/plugins/-/reload", a, {})).status).toBe(403);
    expect((await post("/api/studio/plugins/-/reload/teams", a, {})).status).toBe(403);
    expect((await get("/api/studio/plugins/-/events", a)).status).toBe(404);
  });

  it("refuses a test run without credits and reserves credits with them", async () => {
    const [projectB] = (await (await get("/api/studio/projects", b)).json()) as { id: string }[];
    const wb = ((await (await post("/api/studio/wizards", b, { projectId: projectB.id })).json()) as { id: string }).id;
    const broke = await post(`/api/studio/wizards/${wb}/test-runs`, b, {});
    expect(broke.status).toBe(402);
    const ok = await post(`/api/studio/wizards/${wizardOfA}/test-runs`, a, {});
    expect(ok.status).toBe(200);
  });

  it("accepts the Manage-App's tokens and keys on the MCP endpoint, in the token's tenant", async () => {
    const list = (authorization: string) =>
      app.fetch(
        new Request(`${RUNTIME}/api/mcp`, {
          method: "POST",
          headers: {
            authorization,
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "list_wizards", arguments: {} },
          }),
        }),
      );
    const asA = await list(
      `Bearer ${await token({ sub: "user-a", tenant: "tenant-a", role: "owner", azp: "claude-code" }, `${RUNTIME}/api/mcp`)}`,
    );
    expect(asA.status).toBe(200);
    expect(await asA.text()).toContain(wizardOfA);
    const asB = await list("Bearer wz_key_of_b");
    expect(asB.status).toBe(200);
    expect(await asB.text()).not.toContain(wizardOfA);
    // A token for another audience, an unknown key and no token are all turned away.
    const wrongAudience = await list(
      `Bearer ${await token({ sub: "user-a", tenant: "tenant-a" }, "https://elsewhere.example")}`,
    );
    expect(wrongAudience.status).toBe(401);
    expect((await list("Bearer wz_unknown")).status).toBe(401);
    const meta = await app.fetch(
      new Request(`${RUNTIME}/.well-known/oauth-protected-resource/api/mcp`),
    );
    expect(await meta.json()).toMatchObject({
      resource: `${RUNTIME}/api/mcp`,
      authorization_servers: [issuer],
    });
  });

  it("imports and publishes a wizard through the API", async () => {
    const res = await app.fetch(
      new Request(`${RUNTIME}/api/v1/wizards/import`, {
        method: "POST",
        headers: { authorization: "Bearer wz_key_of_b", "content-type": "application/json" },
        body: JSON.stringify({
          publish: true,
          definition: {
            version: 1,
            title: "Aus der Desktop-App",
            description: "",
            avatar: "round",
            steps: [
              { id: "start", type: "page", title: "Start", fields: [{ id: "name", kind: "text", label: "Name" }] },
              { id: "done", type: "result", title: "Fertig", deliverables: [] },
            ],
          },
          files: [{ path: "data/a.json", data: Buffer.from("{}").toString("base64") }],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { wizardId: string; shareUrl: string; version: number };
    expect(body.version).toBe(1);
    const token_ = body.shareUrl.split("/w/")[1];
    const open = await app.fetch(new Request(`${RUNTIME}/api/public/wizards/${token_}`));
    // Tenant B has no credits: the link exists but cannot start runs.
    expect(((await open.json()) as { title: string; available: boolean })).toMatchObject({
      title: "Aus der Desktop-App",
      available: false,
    });
  });

  it("hands a sign-in from the system browser to the desktop app's window, once", async () => {
    // The app's window asks; the sign-in then runs in another browser.
    const start = await app.fetch(
      new Request(`${RUNTIME}/api/auth/desktop/start`, { method: "POST" }),
    );
    const windowCookie = cookieOf(start, "wz_desktop");
    const { url } = (await start.json()) as { url: string };
    const login = await app.fetch(new Request(url));
    const authorize = new URL(login.headers.get("location") ?? "");
    const callback = await app.fetch(
      new Request(
        `${RUNTIME}/api/auth/callback?code=code-a&state=${authorize.searchParams.get("state")}`,
        { headers: { cookie: cookieOf(login, "wz_oauth") } },
      ),
    );
    // The browser gets no session, only the link back into the app.
    expect(cookieOf(callback, "wz_session")).toBe("");
    const code = (await callback.text()).match(/engenty-wizards:\/\/signin\?code=([^"]+)"/)?.[1];
    expect(code).toBeTruthy();
    const handoff = (cookie: string) =>
      app.fetch(new Request(`${RUNTIME}/api/auth/handoff?code=${code}`, { headers: { cookie } }));
    // A window that did not ask (some web page sent the link) gets nothing.
    const stranger = await handoff("");
    expect(cookieOf(stranger, "wz_session")).toBe("");
    const mine = await handoff(windowCookie);
    const session = cookieOf(mine, "wz_session");
    expect(session).not.toBe("");
    expect((await get("/api/studio/me", session)).status).toBe(200);
    // The code works once.
    expect(cookieOf(await handoff(windowCookie), "wz_session")).toBe("");
  });

  it("suspends and deletes a tenant when the Manage-App says so", async () => {
    const tell = (id: string, action: string, key = SERVICE_KEY) =>
      app.fetch(
        new Request(`${RUNTIME}/api/internal/tenants/${id}`, {
          method: "POST",
          headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
          body: JSON.stringify({ action }),
        }),
      );
    expect((await tell("tenant-a", "suspend", "wrong")).status).toBe(401);
    expect((await tell("tenant-a", "suspend")).status).toBe(200);
    expect((await get("/api/studio/me", a)).status).toBe(403);
    expect((await tell("tenant-a", "resume")).status).toBe(200);
    expect((await get("/api/studio/me", a)).status).toBe(200);
    expect((await tell("tenant-a", "delete")).status).toBe(200);
    const projects = (await (await get("/api/studio/projects", a)).json()) as { wizardCount: number }[];
    expect(projects[0].wizardCount).toBe(0);
  });
});
