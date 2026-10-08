import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The WhatsApp module (modules/whatsapp) inside the runtime: the number in the settings, the
 * keyword in the share dialog, the webhook, and a wizard run in the thread from the first
 * question to the link at the end. Meta's API is stood in for: what the plugin sends is kept,
 * and the files the person "sent" are handed out.
 */

const dir = mkdtempSync(join(tmpdir(), "wizards-whatsapp-"));
process.env.DATA_DIR = join(dir, "data");
process.env.APP_URL = "http://localhost:5181";
process.env.LOCAL_ACCESS_KEY = "test-key";
process.env.PLUGINS_DIR = join(dir, "plugins");
process.env.PLUGINS_WATCH = "0";
process.env.AI_GATEWAY_API_KEY = "";
process.env.OPENAI_API_KEY = "";
process.env.ANTHROPIC_API_KEY = "";

// --- Meta, stood in for ------------------------------------------------------------------

interface Sent {
  to: string;
  // biome-ignore lint/suspicious/noExplicitAny: what the plugin posted, as it is
  body: any;
}
const sent: Sent[] = [];
const files = new Map<string, { mime: string; data: Uint8Array }>();
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("https://graph.facebook.com/")) {
    const path = url.replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+\//, "");
    if (path.endsWith("/messages")) {
      const body = JSON.parse(String(init?.body));
      if (body.status !== "read") {
        sent.push({ to: body.to, body });
      }
      return Response.json({ messages: [{ id: `wamid.${sent.length}` }] });
    }
    const file = files.get(path);
    return file
      ? Response.json({ url: `https://lookaside.test/${path}`, mime_type: file.mime })
      : Response.json({ error: { message: "Unsupported get request.", code: 100 } }, { status: 400 });
  }
  if (url.startsWith("https://lookaside.test/")) {
    const file = files.get(url.slice("https://lookaside.test/".length));
    return file
      ? new Response(file.data, { headers: { "content-type": file.mime } })
      : new Response("gone", { status: 404 });
  }
  return realFetch(input, init);
}) as typeof fetch;

// A tiny PNG, enough for a photo field.
const PNG = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0,
  0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 15, 0, 1, 1, 1, 0, 24, 221,
  142, 175, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

/** The last messages the plugin sent, after the ones seen before. */
let seenUpTo = 0;
function fresh(): Sent["body"][] {
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

/** Waits until the plugin sent `n` more messages, and gives them. */
const replies = async (n = 1) => {
  await until(
    () => sent.length,
    (len) => len >= seenUpTo + n,
  );
  // One more tick: a burst (a text, then buttons) arrives together.
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
let verifyToken = "";
const SECRET = "app-secret";
const FROM = "436601234567";
let messageSerial = 0;

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
const plugin = (path: string) => `/api/studio/plugins/whatsapp${path}`;

/** A message of the person, as Meta posts it. */
function inbound(message: Record<string, unknown>, options: { id?: string; sign?: string } = {}) {
  const id = options.id ?? `wamid.in.${++messageSerial}`;
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "4366012345", phone_number_id: "PN1" },
              contacts: [{ profile: { name: "Ada" }, wa_id: FROM }],
              messages: [{ from: FROM, id, timestamp: String(Math.floor(Date.now() / 1000)), ...message }],
            },
          },
        ],
      },
    ],
  });
  const signature = options.sign ?? `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
  return app.fetch(
    new Request(webhook, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": signature },
      body,
    }),
  );
}
const text = (body: string) => inbound({ type: "text", text: { body } });
const tap = (id: string, title = id) =>
  inbound({ type: "interactive", interactive: { type: "button_reply", button_reply: { id, title } } });
const pick = (id: string, title = id) =>
  inbound({ type: "interactive", interactive: { type: "list_reply", list_reply: { id, title } } });

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
        { id: "mail", kind: "email", label: "E-Mail" },
        { id: "kind", kind: "select", label: "Art", options: ["Rohr", "Dach", "Sonstiges"], required: true },
        {
          id: "which",
          kind: "text",
          label: "Was genau",
          when: { field: "kind", op: "equals", value: "Sonstiges" },
        },
        { id: "urgent", kind: "toggle", label: "Dringend" },
      ],
    },
    {
      id: "proof",
      type: "page",
      title: "Nachweis",
      fields: [
        { id: "photo", kind: "image", label: "Foto", required: true },
        { id: "where", kind: "location", label: "Wo" },
      ],
    },
    { id: "done", type: "result", title: "Fertig", deliverables: [] },
  ],
};

const contract = {
  version: 1,
  title: "Vertrag",
  description: "Unterschreiben",
  avatar: "round",
  steps: [
    {
      id: "sign",
      type: "page",
      title: "Unterschrift",
      fields: [
        { id: "name", kind: "text", label: "Name", required: true },
        { id: "signature", kind: "signature", label: "Unterschrift", required: true },
      ],
    },
    { id: "done", type: "result", title: "Fertig", deliverables: [] },
  ],
};

let damageId = "";
let contractId = "";

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
    contractId = (await wizards.createWizard(LOCAL, { definition: contract })).id;
    await wizards.publishWizard(LOCAL, contractId);
  });
}, 60_000);

afterAll(() => {
  globalThis.fetch = realFetch;
});

describe("connecting the number", () => {
  it("the runner is there but not ready until a number is connected", async () => {
    const before = await json(send("GET", `/api/studio/wizards/${damageId}/runners`));
    const runner = before.runners.find((r: { id: string }) => r.id === "whatsapp");
    expect(runner).toMatchObject({ kind: "channel", fit: { outcome: "full" } });
    expect(runner.problem).toMatch(/WhatsApp/);

    const saved = await json(
      send("PUT", plugin("/account"), {
        phoneNumberId: "PN1",
        number: "+43 660 12345",
        accessToken: "EAAB.token",
        appSecret: SECRET,
      }),
    );
    expect(saved).toMatchObject({ connected: true, number: "4366012345", hasToken: true, hasSecret: true });
    expect(saved.webhook).toMatch(/^http:\/\/localhost:5181\/api\/public\/plugins\/whatsapp\/[^/]+\/webhook$/);
    expect(saved.verifyToken).toHaveLength(24);
    webhook = saved.webhook;
    verifyToken = saved.verifyToken;

    const after = await json(send("GET", `/api/studio/wizards/${damageId}/runners`));
    expect(after.runners.find((r: { id: string }) => r.id === "whatsapp").problem).toBeNull();
    // The token stays when the settings are saved without it.
    const again = await json(send("PUT", plugin("/account"), { phoneNumberId: "PN1", number: "4366012345" }));
    expect(again.hasToken).toBe(true);
  });

  it("the owner switches the door on per wizard and gets a keyword with its link", async () => {
    for (const id of [damageId, contractId]) {
      const res = await send("PATCH", `/api/studio/wizards/${id}`, {
        runners: { default: "steps", enabled: ["steps", "chat", "whatsapp"] },
      });
      expect(res.status).toBe(200);
    }
    const binding = await json(send("GET", plugin(`/binding/${damageId}`)));
    expect(binding).toEqual({
      keyword: "schadensmeldung",
      link: "https://wa.me/4366012345?text=schadensmeldung",
      number: "4366012345",
    });
    const changed = await json(send("PUT", plugin(`/binding/${damageId}`), { keyword: "Schaden" }));
    expect(changed.link).toBe("https://wa.me/4366012345?text=Schaden");
    expect((await send("PUT", plugin(`/binding/${damageId}`), { keyword: "???" })).status).toBe(400);
    const other = await json(send("GET", plugin(`/binding/${contractId}`)));
    expect(other.keyword).toBe("vertrag");
    expect((await send("PUT", plugin(`/binding/${contractId}`), { keyword: "schaden" })).status).toBe(409);
  });

  it("Meta checks the address with the verify token, and every post with its signature", async () => {
    const ok = await app.fetch(
      new Request(`${webhook}?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=4711`),
    );
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("4711");
    const wrong = await app.fetch(
      new Request(`${webhook}?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=4711`),
    );
    expect(wrong.status).toBe(403);
    expect((await text("hallo")).status).toBe(200);
    expect((await inbound({ type: "text", text: { body: "x" } }, { sign: "sha256=00" })).status).toBe(403);
  });
});

describe("a wizard in the thread", () => {
  it("the keyword starts it and the first field is asked", async () => {
    // "hallo" above: no run yet, two wizards on → the menu.
    const menu = await replies();
    expect(menu[0].interactive.type).toBe("list");
    expect(menu[0].interactive.action.sections[0].rows.map((r: { title: string }) => r.title)).toEqual([
      "Schadensmeldung",
      "Vertrag",
    ]);
    await text("SCHADEN");
    const [name] = await replies();
    expect(name.type).toBe("text");
    expect(name.text.body).toBe("Name");
  });

  it("text, a skipped optional field, buttons for a choice and for yes/no; a condition follows the draft", async () => {
    await text("Ada Lovelace");
    const [mail] = await replies();
    expect(mail.text.body).toContain("E-Mail");
    expect(mail.text.body).toContain("weiter");
    await text("weiter");
    const [kind] = await replies();
    expect(kind.interactive.type).toBe("button");
    expect(kind.interactive.action.buttons.map((b: { reply: { title: string } }) => b.reply.title)).toEqual([
      "Rohr",
      "Dach",
      "Sonstiges",
    ]);
    // "Sonstiges" shows "Was genau" on the same page; "Dach" does not.
    await tap("o:2", "Sonstiges");
    const [which] = await replies();
    expect(which.text.body).toContain("Was genau");
    await text("Markise");
    const [urgent] = await replies();
    expect(urgent.interactive.type).toBe("button");
    expect(urgent.interactive.body.text).toBe("Dringend");
    await text("vielleicht");
    const [again] = await replies();
    expect(again.interactive.body.text).toMatch(/^Bitte mit Ja oder Nein antworten\.\n\nDringend$/);
    await tap("t:1", "Ja");
    const [photo] = await replies();
    expect(photo.text.body).toContain("Foto");
    expect(photo.text.body).toContain("Bitte ein Foto schicken.");
  });

  it("a photo comes as a file of the thread, a place as a location; the end is a link", async () => {
    await text("hier?");
    const [hint] = await replies();
    expect(hint.text.body).toMatch(/^Bitte ein Foto schicken\.\n\nFoto/);
    files.set("media-1", { mime: "image/png", data: PNG });
    await inbound({ type: "image", image: { id: "media-1", mime_type: "image/png", sha256: "x" } });
    const [where] = await replies();
    expect(where.interactive.type).toBe("location_request_message");
    await inbound({
      type: "location",
      location: { latitude: 48.2082, longitude: 16.3738, name: "Stephansplatz", address: "1010 Wien" },
    });
    const [done] = await replies();
    expect(done.interactive.type).toBe("cta_url");
    expect(done.interactive.body.text).toBe("Fertig! Alles liegt hier:");
    expect(done.interactive.action.parameters.url).toMatch(/\/w\/[^/]+\/[^/?]+\?rt=/);

    const run = await client.withTenant(LOCAL, () =>
      client.db.query.run.findMany({ where: (r, { eq }) => eq(r.wizardId, damageId) }),
    );
    expect(run).toHaveLength(1);
    expect(run[0]).toMatchObject({ status: "done", runner: "whatsapp", mode: "live" });
    expect(run[0].visitorId).toMatch(/^p:[0-9a-f]{32}$/);
    expect(run[0].state.values).toMatchObject({
      name: "Ada Lovelace",
      kind: "Sonstiges",
      which: "Markise",
      urgent: true,
      where: { lat: 48.2082, lng: 16.3738, label: "Stephansplatz, 1010 Wien" },
    });
    expect(run[0].state.values.mail).toBeUndefined();
    const photo = await client.withTenant(LOCAL, () =>
      client.db.query.asset.findFirst({ where: (a, { eq }) => eq(a.id, String(run[0].state.values.photo)) }),
    );
    expect(photo).toMatchObject({ runId: run[0].id, mime: "image/png", kind: "image" });
  });

  it("a posted message is dealt with once; after the end the keyword starts anew", async () => {
    const before = sent.length;
    await inbound({ type: "text", text: { body: "noch was" } }, { id: `wamid.in.${messageSerial}` });
    await new Promise((r) => setTimeout(r, 150));
    expect(sent.length).toBe(before);
    await text("noch was");
    const [over] = await replies();
    expect(over.text.body).toBe("Dieser Durchlauf ist beendet. Mit dem Stichwort beginnt ein neuer.");
    await text("schaden");
    const [name] = await replies();
    expect(name.text.body).toBe("Name");
    await text("stop");
    const [stopped] = await replies();
    expect(stopped.text.body).toMatch(/^Abgebrochen/);
    const runs = await client.withTenant(LOCAL, () =>
      client.db.query.run.findMany({ where: (r, { eq }) => eq(r.wizardId, damageId) }),
    );
    expect(runs.map((r) => r.status).sort()).toEqual(["cancelled", "done"]);
  });

  it("a page the thread cannot take goes to the screen, and the thread goes on when it was filled there", async () => {
    await text("vertrag");
    const [link] = await replies();
    expect(link.interactive.type).toBe("cta_url");
    expect(link.interactive.body.text).toMatch(/Bildschirm/);
    const handoff = new URL(link.interactive.action.parameters.url);
    const runId = handoff.pathname.split("/").pop()!;
    const ticket = handoff.searchParams.get("rt")!;
    // Filled on the run page, with the ticket from the link.
    const sign = await client.withTenant(LOCAL, async () => {
      const { saveAsset } = await import("../src/files/storage");
      return saveAsset({ runId, kind: "image", mime: "image/png", name: "sign.png", data: PNG });
    });
    const filled = await app.fetch(
      new Request(url(`/api/runs/${runId}/pages/sign?rt=${encodeURIComponent(ticket)}`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: { name: "Ada", signature: sign.id } }),
      }),
    );
    expect(filled.status).toBe(200);
    const [done] = await replies();
    expect(done.interactive.type).toBe("cta_url");
    expect(done.interactive.body.text).toBe("Fertig! Alles liegt hier:");
  });
});
