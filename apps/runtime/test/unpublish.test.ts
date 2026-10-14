import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// A published wizard taken back to its draft: its link answers as a draft's does, runs already
// started carry on, and publishing again goes on from the last version.

const dir = mkdtempSync(join(tmpdir(), "wizards-unpublish-"));
process.env.DATA_DIR = dir;
process.env.APP_URL = "http://localhost:5181";
process.env.LOCAL_ACCESS_KEY = "test-key";
process.env.MARKETPLACE_URL = "off";
process.env.AI_GATEWAY_API_KEY = "";
process.env.OPENAI_API_KEY = "";
process.env.ANTHROPIC_API_KEY = "";

type App = { fetch: (req: Request) => Response | Promise<Response> };
let app: App;
let cookie = "";
let wizardId = "";
let shareToken = "";

const definition = {
  version: 1,
  title: "Übergabe",
  description: "Wohnungsübergabe",
  avatar: "dome",
  steps: [
    {
      id: "start",
      type: "page",
      title: "Start",
      fields: [{ id: "name", kind: "text", label: "Name" }],
    },
    { id: "done", type: "result", title: "Fertig", deliverables: [] },
  ],
};

const url = (path: string) => `http://localhost:5181${path}`;
const send = (method: string, path: string, body?: unknown, as = cookie) =>
  app.fetch(
    new Request(url(path), {
      method,
      headers: { cookie: as, "content-type": "application/json", origin: "http://localhost:5181" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
const json = async (res: Response | Promise<Response>) => (await res).json() as Promise<any>;
/** A visitor starts a run behind the link: the response, and the visitor's cookie. */
const startRun = async () => {
  const res = await send("POST", `/api/public/wizards/${shareToken}/runs`, {}, "");
  return { res, visitor: res.headers.get("set-cookie")?.split(";")[0] ?? "" };
};

beforeAll(async () => {
  const client = await import("../src/db/client");
  await client.migrateControlDb();
  await client.openTenantDb("local");
  app = (await import("../src/app")).default;
  const entered = await app.fetch(new Request(url("/api/local/enter?k=test-key")));
  cookie = (entered.headers.get("set-cookie") ?? "").split(";")[0];
  const projects = await import("../src/services/projects");
  const spaceId = (await client.withTenant("local", () => projects.defaultProject("local"))).id;
  const created = await json(send("POST", "/api/studio/wizards", { projectId: spaceId }));
  wizardId = created.id;
  const current = await json(send("GET", `/api/studio/wizards/${wizardId}`));
  await send("PUT", `/api/studio/wizards/${wizardId}/draft`, {
    definition,
    baseRevision: current.revision,
  });
  shareToken = current.shareToken;
}, 60_000);

describe("unpublishing a wizard", () => {
  let runId = "";
  let visitor = "";

  it("answers a draft's link with not found, and a published one's with the wizard", async () => {
    expect((await send("GET", `/api/public/wizards/${shareToken}`, undefined, "")).status).toBe(404);
    const published = await json(send("POST", `/api/studio/wizards/${wizardId}/publish`));
    expect(published).toMatchObject({ version: 1 });
    expect((await send("GET", `/api/public/wizards/${shareToken}`, undefined, "")).status).toBe(200);
    const started = await startRun();
    expect(started.res.status).toBe(200);
    runId = ((await started.res.json()) as { runId: string }).runId;
    visitor = started.visitor;
  });

  it("takes it back to its draft: its link and new runs answer as a draft's", async () => {
    const res = await send("POST", `/api/studio/wizards/${wizardId}/unpublish`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ published: false, cloud: null });
    const wizard = await json(send("GET", `/api/studio/wizards/${wizardId}`));
    expect(wizard).toMatchObject({ published: false, publishedVersion: null, shareToken });
    expect((await send("GET", `/api/public/wizards/${shareToken}`, undefined, "")).status).toBe(404);
    expect((await startRun()).res.status).toBe(404);
    expect(
      (await send("GET", `/api/public/wizards/${shareToken}/manifest.webmanifest`, undefined, ""))
        .status,
    ).toBe(404);
  });

  it("lets a run already started carry on with its version", async () => {
    const res = await send("GET", `/api/runs/${runId}`, undefined, visitor);
    expect(res.status).toBe(200);
  });

  it("takes an unpublished wizard back again without a change", async () => {
    const res = await send("POST", `/api/studio/wizards/${wizardId}/unpublish`);
    expect(await res.json()).toEqual({ published: false, cloud: null });
  });

  it("publishes again as the next version, behind the same link", async () => {
    const published = await json(send("POST", `/api/studio/wizards/${wizardId}/publish`));
    expect(published).toMatchObject({ version: 2 });
    expect((await send("GET", `/api/public/wizards/${shareToken}`, undefined, "")).status).toBe(200);
  });

  it("refuses someone signed out, and a wizard that is not there", async () => {
    expect((await send("POST", `/api/studio/wizards/${wizardId}/unpublish`, {}, "")).status).toBe(
      401,
    );
    expect((await send("POST", "/api/studio/wizards/nope/unpublish")).status).toBe(404);
  });
});
