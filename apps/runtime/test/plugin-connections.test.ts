import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Accounts a plugin connects for a space (`server.connections`): the sign-in page, the shared
 * OAuth callback finishing it in the right tenant, the kept connection, and what calling it
 * refuses. The provider is played by a stubbed `fetch`.
 */
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "wizards-plugin-connections-"));
process.env.APP_URL = "http://localhost:5181";
process.env.GOOGLE_OAUTH_CLIENT_ID = "client-id";
process.env.GOOGLE_OAUTH_CLIENT_SECRET = "client-secret";

let client: typeof import("../src/db/client");
let connections: typeof import("../src/connectors/plugin-connections");
let app: typeof import("../src/app").default;
let space: string;

const TENANT = "tenant-c";
const inTenant = <T>(fn: () => Promise<T>) => client.withTenant(TENANT, fn);
const real = globalThis.fetch;

beforeAll(async () => {
  client = await import("../src/db/client");
  await client.migrateControlDb();
  await client.openTenantDb(TENANT);
  connections = await import("../src/connectors/plugin-connections");
  app = (await import("../src/app")).default;
  const projects = await import("../src/services/projects");
  space = (await inTenant(() => projects.createProject("user-c", "Kalender"))).id;
}, 60_000);

afterEach(() => {
  globalThis.fetch = real;
});

describe("plugin connections", () => {
  const cal = () => connections.pluginConnections("appointments");

  it("offers the connectors that can be signed in to here", async () => {
    const offered = await inTenant(() => cal().available(["google-calendar", "nope", "s3"]));
    expect(offered).toEqual([{ id: "google-calendar", name: "Google Calendar" }]);
  });

  it("asks only for the rights the named actions need", async () => {
    const { url } = await inTenant(() =>
      cal().start({ space, connector: "google-calendar", actions: ["list_events", "create_event"] }),
    );
    const scope = new URL(url).searchParams.get("scope") ?? "";
    expect(scope).toContain("https://www.googleapis.com/auth/calendar.readonly");
    expect(scope).toContain("https://www.googleapis.com/auth/calendar.events");
    expect(scope).not.toContain("gmail");
    await expect(
      inTenant(() => cal().start({ space: "nope", connector: "google-calendar", actions: [] })),
    ).rejects.toThrow(/no space/);
    await expect(
      inTenant(() => cal().start({ space, connector: "google-calendar", actions: ["send_mail"] })),
    ).rejects.toThrow(/no action "send_mail"/);
  });

  it("keeps the account when the provider comes back, once per account", async () => {
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const target = String(input instanceof Request ? input.url : input);
      if (target.includes("oauth2.googleapis.com/token")) {
        return Response.json({
          access_token: "at",
          refresh_token: "rt",
          expires_in: 3600,
          scope: "https://www.googleapis.com/auth/calendar.readonly",
        });
      }
      if (target.includes("/userinfo")) {
        return Response.json({ email: "matthias@example.at" });
      }
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch;
    for (let i = 0; i < 2; i += 1) {
      const { url } = await inTenant(() =>
        cal().start({ space, connector: "google-calendar", actions: ["list_events"] }),
      );
      const state = new URL(url).searchParams.get("state") ?? "";
      expect(connections.pluginStateTenant(state)).toBe(TENANT);
      const res = await app.fetch(
        new Request(`http://localhost:5181/api/connect/callback?code=c${i}&state=${encodeURIComponent(state)}`),
      );
      expect(await res.text()).toContain("Verbunden");
    }
    const list = await inTenant(() => cal().list(space));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ connector: "google-calendar", label: "matthias@example.at", actions: ["list_events"] });
    // Another plugin sees none of it.
    expect(await inTenant(() => connections.pluginConnections("other").list(space))).toEqual([]);
  });

  it("refuses an action the connection was not made for, and forgets it", async () => {
    const [found] = await inTenant(() => cal().list(space));
    await expect(inTenant(() => cal().call(found.id, "delete_event", { event_id: "x" }))).rejects.toThrow(
      /not made for "delete_event"/,
    );
    await inTenant(() => cal().remove(found.id));
    expect(await inTenant(() => cal().list(space))).toEqual([]);
  });
});
