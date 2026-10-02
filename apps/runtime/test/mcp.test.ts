import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { beforeAll, describe, expect, it } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "wizards-mcp-"));
process.env.DATA_DIR = dir;
process.env.APP_URL = "http://localhost:5181";
process.env.DEV_LOGIN = "1";

const MCP_URL = "http://localhost:5181/api/mcp";

type App = { fetch: (req: Request) => Response | Promise<Response> };
let app: App;
let key: string;

async function connect(): Promise<Client> {
  const client = new Client({ name: "vitest", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(MCP_URL), {
      fetch: (url, init) => Promise.resolve(app.fetch(new Request(url, init))),
      requestInit: { headers: { authorization: `Bearer ${key}` } },
    }),
  );
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as { type: string; text: string }[])[0]?.text ?? "";
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    // plain text (the guide)
  }
  return { isError: Boolean(res.isError), body };
}

beforeAll(async () => {
  const { migrateControlDb } = await import("../src/db/client");
  await migrateControlDb();
  const { createLocalKey } = await import("../src/auth/keys");
  key = (await createLocalKey("Claude Code")).key;
  app = (await import("../src/app")).default;
}, 60_000);

describe("MCP endpoint", () => {
  it("refuses a request without a key", async () => {
    const res = await app.fetch(
      new Request(MCP_URL, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toMatch(/Bearer/);
  });

  it("lists the authoring tools", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        "get_authoring_guide",
        "create_wizard",
        "edit_wizard",
        "replace_wizard",
        "publish_wizard",
        "start_test_run",
        "get_test_run",
      ]),
    );
    const guide = await call(client, "get_authoring_guide");
    expect(guide.body).toContain("type Wizard");
  });

  it("creates, edits with revisions, refuses stale writes and unclean publishes", async () => {
    const client = await connect();
    const created = await call(client, "create_wizard", { note: "Leeren Wizard angelegt." });
    expect(created.isError).toBe(false);
    const { wizardId } = created.body;
    expect(created.body.revision).toBe(0);

    const edited = await call(client, "edit_wizard", {
      wizardId,
      baseRevision: 0,
      ops: [
        { op: "set_meta", title: "Stellenanzeige" },
        {
          op: "upsert_step",
          step: {
            id: "done",
            type: "result",
            title: "Fertig",
            deliverables: [{ from: "missing", formats: ["md"] }],
          },
        },
      ],
      note: "Titel gesetzt.",
    });
    expect(edited.isError).toBe(false);
    expect(edited.body.revision).toBe(1);
    expect(edited.body.issues.length).toBeGreaterThan(0);

    const stale = await call(client, "edit_wizard", {
      wizardId,
      baseRevision: 0,
      ops: [{ op: "set_meta", title: "Zu spät" }],
    });
    expect(stale.isError).toBe(true);
    expect(stale.body).toMatchObject({ code: "revision_conflict", revision: 1 });

    const refused = await call(client, "publish_wizard", { wizardId });
    expect(refused.isError).toBe(true);
    expect(refused.body.code).toBe("has_issues");

    const badShape = await call(client, "validate_wizard", { definition: { title: "x" } });
    expect(badShape.body.ok).toBe(false);

    const fixed = await call(client, "edit_wizard", {
      wizardId,
      baseRevision: 1,
      ops: [
        {
          op: "upsert_step",
          step: { id: "done", type: "result", title: "Fertig", deliverables: [] },
        },
      ],
    });
    expect(fixed.body).toMatchObject({ revision: 2, issues: [] });

    const { withTenant, db, schema } = await import("../src/db/client");
    const { eq } = await import("drizzle-orm");
    const notes = await withTenant("local", () =>
      db.query.wizardMessage.findMany({ where: eq(schema.wizardMessage.wizardId, wizardId) }),
    );
    expect(notes.map((n) => [n.source, n.client, n.content])).toEqual([
      ["mcp", "Claude Code", "Leeren Wizard angelegt."],
      ["mcp", "Claude Code", "Titel gesetzt."],
    ]);

    const run = await call(client, "start_test_run", { wizardId, answers: { input: "Bäcker" } });
    expect(run.isError).toBe(false);
    const report = await call(client, "get_test_run", { runId: run.body.runId, waitSeconds: 10 });
    expect(report.body.status).toBe("done");

    const published = await call(client, "publish_wizard", { wizardId });
    expect(published.body).toMatchObject({ version: 1 });
    expect(published.body.shareUrl).toMatch(/^http:\/\/localhost:5181\/r\//);
  });
});
