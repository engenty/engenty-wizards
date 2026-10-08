import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The SMS module (modules/sms) inside the runtime: the Twilio account in the settings, the
 * keyword in the share dialog, the webhook with Twilio's signature, and a wizard run by text
 * from the first question to the link at the end. Twilio is stood in for: what the plugin
 * sends is kept.
 */

const dir = mkdtempSync(join(tmpdir(), "wizards-sms-"));
process.env.DATA_DIR = join(dir, "data");
process.env.APP_URL = "http://localhost:5181";
process.env.LOCAL_ACCESS_KEY = "test-key";
process.env.PLUGINS_DIR = join(dir, "plugins");
process.env.PLUGINS_WATCH = "0";
process.env.AI_GATEWAY_API_KEY = "";
process.env.OPENAI_API_KEY = "";
process.env.ANTHROPIC_API_KEY = "";

// --- Twilio, stood in for ----------------------------------------------------------------

const sent: { to: string; body: string }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("https://api.twilio.com/")) {
    const form = new URLSearchParams(String(init?.body));
    sent.push({ to: form.get("To") ?? "", body: form.get("Body") ?? "" });
    return Response.json({ sid: `SM${sent.length}`, status: "queued" });
  }
  return realFetch(input, init);
}) as typeof fetch;

let seenUpTo = 0;
function fresh(): string[] {
  const out = sent.slice(seenUpTo).map((s) => s.body);
  seenUpTo = sent.length;
  return out;
}

async function until<T>(read: () => T | Promise<T>, done: (value: T) => boolean): Promise<T> {
  for (let i = 0; i < 200; i++) {
    const value = await read();
    if (done(value)) {
      return value;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("timed out");
}

const replies = async (n = 1) => {
  await until(
    () => sent.length,
    (len) => len >= seenUpTo + n,
  );
  await new Promise((r) => setTimeout(r, 60));
  return fresh();
};

// ---------------------------------------------------------------------------------------

type App = { fetch: (req: Request) => Response | Promise<Response> };
let app: App;
let client: typeof import("../src/db/client");
let wizards: typeof import("../src/services/wizards");
let cookie = "";
let webhook = "";
const TOKEN = "auth-token";
const FROM = "+436601234567";
let serial = 0;

const LOCAL = "local";
const url = (path: string) => `http://localhost:5181${path}`;
const send = (method: string, path: string, body?: unknown) =>
  app.fetch(
    new Request(url(path), {
      method,
      headers: { cookie, "content-type": "application/json", origin: "http://localhost:5181" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
// biome-ignore lint/suspicious/noExplicitAny: test bodies
const json = async (res: Response | Promise<Response>) => (await res).json() as Promise<any>;
const plugin = (path: string) => `/api/studio/plugins/sms${path}`;

/** Twilio's signature: HMAC-SHA1 of the address with the sorted form fields appended. */
function sign(address: string, form: URLSearchParams, token = TOKEN): string {
  const names = [...new Set(form.keys())].sort();
  const data = names.reduce((acc, name) => acc + name + form.getAll(name).join(""), address);
  return createHmac("sha1", token).update(data, "utf8").digest("base64");
}

/** A text of the person, as Twilio posts it. */
function text(body: string, options: { id?: string; token?: string } = {}) {
  const form = new URLSearchParams({
    MessageSid: options.id ?? `SM.in.${++serial}`,
    From: FROM,
    To: "+4366012345",
    Body: body,
    NumMedia: "0",
  });
  return app.fetch(
    new Request(webhook, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": sign(webhook, form, options.token),
      },
      body: form.toString(),
    }),
  );
}

const damage = {
  version: 1,
  title: "Schadensmeldung",
  description: "Ein Schaden, kurz gemeldet",
  avatar: "dome",
  steps: [
    {
      id: "who",
      type: "page",
      title: "Wer",
      fields: [
        { id: "name", kind: "text", label: "Name", required: true },
        { id: "kind", kind: "select", label: "Art", options: ["Rohr", "Dach", "Sonstiges"], required: true },
        { id: "tags", kind: "multiselect", label: "Betroffen", options: ["Küche", "Bad", "Keller"] },
        { id: "urgent", kind: "toggle", label: "Dringend" },
      ],
    },
    {
      id: "proof",
      type: "page",
      title: "Nachweis",
      fields: [{ id: "photo", kind: "image", label: "Foto", required: true }],
    },
    { id: "done", type: "result", title: "Fertig", deliverables: [] },
  ],
};

let damageId = "";

beforeAll(async () => {
  client = await import("../src/db/client");
  await client.migrateControlDb();
  const loader = await import("../src/plugins/loader");
  await loader.loadPlugins();
  await client.openTenantDb(LOCAL);
  wizards = await import("../src/services/wizards");
  app = (await import("../src/app")).default;
  const entered = await app.fetch(new Request(url("/api/local/enter?k=test-key")));
  cookie = (entered.headers.get("set-cookie") ?? "").split(";")[0];
  await client.withTenant(LOCAL, async () => {
    damageId = (await wizards.createWizard(LOCAL, { definition: damage })).id;
    await wizards.publishWizard(LOCAL, damageId);
  });
}, 60_000);

afterAll(() => {
  globalThis.fetch = realFetch;
});

describe("connecting the number", () => {
  it("the runner hands off at the photo, and is not ready until a number is connected", async () => {
    const before = await json(send("GET", `/api/studio/wizards/${damageId}/runners`));
    const runner = before.runners.find((r: { id: string }) => r.id === "sms");
    expect(runner).toMatchObject({ kind: "channel", fit: { outcome: "handoff" } });
    expect(runner.fit.steps.map((s: { why: string }) => s.why)).toEqual(["Foto"]);
    expect(runner.problem).toMatch(/SMS/);

    const saved = await json(
      send("PUT", plugin("/account"), {
        accountSid: "ACtest",
        number: "+43 660 12345",
        authToken: TOKEN,
      }),
    );
    expect(saved).toMatchObject({ connected: true, number: "+4366012345", hasToken: true });
    expect(saved.webhook).toMatch(/^http:\/\/localhost:5181\/api\/public\/plugins\/sms\/[^/]+\/webhook$/);
    webhook = saved.webhook;
    const after = await json(send("GET", `/api/studio/wizards/${damageId}/runners`));
    expect(after.runners.find((r: { id: string }) => r.id === "sms").problem).toBeNull();
    const res = await send("PATCH", `/api/studio/wizards/${damageId}`, {
      runners: { default: "steps", enabled: ["steps", "chat", "sms"] },
    });
    expect(res.status).toBe(200);
    expect(await json(send("GET", plugin(`/binding/${damageId}`)))).toEqual({
      keyword: "schadensmeldung",
      link: "sms:+4366012345?body=schadensmeldung",
      number: "+4366012345",
    });
  });

  it("only Twilio's own posts count", async () => {
    expect((await text("hallo", { token: "someone-else" })).status).toBe(403);
    const ok = await text("hallo");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toContain("text/xml");
  });
});

describe("a wizard by text", () => {
  it("one wizard on: the first text starts it; choices are numbered", async () => {
    const [name] = await replies();
    expect(name).toBe("Name");
    await text("Ada");
    const [kind] = await replies();
    expect(kind).toBe("Art\n\n1. Rohr\n2. Dach\n3. Sonstiges\n\nAntwort: die Nummer");
    await text("4");
    const [again] = await replies();
    expect(again).toMatch(/^Bitte eine der Möglichkeiten wählen\.\n\nArt\n\n1\. Rohr/);
    await text("2");
    const [tags] = await replies();
    expect(tags).toBe(
      "Betroffen\n(freiwillig – „weiter“ überspringt)\n\n1. Küche\n2. Bad\n3. Keller\n\nAntwort: die Nummern, mit Komma getrennt",
    );
    await text("1, 3");
    const [urgent] = await replies();
    expect(urgent).toBe("Dringend\n\n1. Ja\n2. Nein\n\nAntwort: die Nummer");
  });

  it("a page with a photo goes to the screen; the end is a link", async () => {
    await text("2");
    const [link] = await replies();
    expect(link).toMatch(/^Dafür braucht es den Bildschirm – danach geht es hier weiter\.\nhttp:\/\/localhost:5181\/w\/[^/]+\/[^/?]+\?rt=/);
    const handoff = new URL(link.split("\n")[1]);
    const runId = handoff.pathname.split("/").pop()!;
    const ticket = handoff.searchParams.get("rt")!;
    const photo = await client.withTenant(LOCAL, async () => {
      const { saveAsset } = await import("../src/files/storage");
      return saveAsset({ runId, kind: "image", mime: "image/png", name: "p.png", data: new Uint8Array([1]) });
    });
    const filled = await app.fetch(
      new Request(url(`/api/runs/${runId}/pages/proof?rt=${encodeURIComponent(ticket)}`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: { photo: photo.id } }),
      }),
    );
    expect(filled.status).toBe(200);
    const [done] = await replies();
    expect(done).toMatch(/^Fertig! Alles liegt hier:\nhttp:\/\/localhost:5181\/w\//);
    const run = await client.withTenant(LOCAL, () =>
      client.db.query.run.findFirst({ where: (r, { eq }) => eq(r.id, runId) }),
    );
    expect(run).toMatchObject({ status: "done", runner: "sms", mode: "live" });
    expect(run!.state.values).toMatchObject({
      name: "Ada",
      kind: "Dach",
      tags: ["Küche", "Keller"],
      urgent: false,
    });
  });
});
