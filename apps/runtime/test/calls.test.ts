import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The calls module (modules/calls) inside the runtime: the accounts in the settings, Twilio's
 * voice webhook answered with TwiML that hands the call to OpenAI over SIP, OpenAI's incoming
 * call picked up with the wizard's rules, and the run driven by the model's tool calls over
 * the WebSocket. Twilio, OpenAI's REST and the WebSocket are stood in for.
 */

const dir = mkdtempSync(join(tmpdir(), "wizards-calls-"));
process.env.DATA_DIR = join(dir, "data");
process.env.APP_URL = "http://localhost:5181";
process.env.LOCAL_ACCESS_KEY = "test-key";
process.env.PLUGINS_DIR = join(dir, "plugins");
process.env.PLUGINS_WATCH = "0";
process.env.AI_GATEWAY_API_KEY = "";
process.env.OPENAI_API_KEY = "";
process.env.ANTHROPIC_API_KEY = "";

// --- Twilio and OpenAI, stood in for -------------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: what the plugin posted, as it is
const openai: { path: string; body: any }[] = [];
const texts: { to: string; from: string; body: string }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("https://api.openai.com/")) {
    openai.push({
      path: url.slice("https://api.openai.com/v1".length),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    return Response.json({ ok: true });
  }
  if (url.startsWith("https://api.twilio.com/")) {
    const form = new URLSearchParams(String(init?.body));
    texts.push({ to: form.get("To") ?? "", from: form.get("From") ?? "", body: form.get("Body") ?? "" });
    return Response.json({ sid: `SM${texts.length}` });
  }
  return realFetch(input, init);
}) as typeof fetch;

/** The socket to the model: what the plugin sends is kept, the test speaks for the model. */
class FakeSocket extends EventTarget {
  static last: FakeSocket | null = null;
  static OPEN = 1;
  // biome-ignore lint/suspicious/noExplicitAny: events as sent
  sent: any[] = [];
  readyState = 0;
  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {
    super();
    FakeSocket.last = this;
    setTimeout(() => {
      this.readyState = 1;
      this.dispatchEvent(new Event("open"));
    }, 0);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  }
  /** The model says: an event as the Realtime API would post it. */
  receive(event: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(event) }));
  }
}
const realSocket = globalThis.WebSocket;
globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;

let seenUpTo = 0;
// biome-ignore lint/suspicious/noExplicitAny: events as sent
function fresh(): any[] {
  const socket = FakeSocket.last!;
  const out = socket.sent.slice(seenUpTo);
  seenUpTo = socket.sent.length;
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

/** Waits until the plugin sent `n` more events to the model, and gives them. */
const sentEvents = async (n = 1) => {
  await until(
    () => FakeSocket.last?.sent.length ?? 0,
    (len) => len >= seenUpTo + n,
  );
  await new Promise((r) => setTimeout(r, 40));
  return fresh();
};

/** A tool call of the model, and the output the plugin answers with. */
async function toolCall(name: string, args: Record<string, unknown> = {}): Promise<string> {
  let calls = 0;
  FakeSocket.last!.receive({
    type: "response.function_call_arguments.done",
    name,
    call_id: `call_${name}_${++calls}`,
    arguments: JSON.stringify(args),
  });
  const events = await sentEvents(2);
  const output = events.find((e) => e.item?.type === "function_call_output");
  expect(output, `an output for ${name}`).toBeTruthy();
  expect(events.at(-1).type).toBe("response.create");
  return output.item.output as string;
}

// ---------------------------------------------------------------------------------------

type App = { fetch: (req: Request) => Response | Promise<Response> };
let app: App;
let client: typeof import("../src/db/client");
let wizards: typeof import("../src/services/wizards");
let cookie = "";
let voiceWebhook = "";
let openaiWebhook = "";
const TWILIO_TOKEN = "twilio-token";
const SECRET_BYTES = Buffer.from("openai-webhook-secret");
const OPENAI_SECRET = `whsec_${SECRET_BYTES.toString("base64")}`;
const CALLER = "+436601234567";

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
const plugin = (path: string) => `/api/studio/plugins/calls${path}`;

function twilioSignature(address: string, form: URLSearchParams, token = TWILIO_TOKEN): string {
  const names = [...new Set(form.keys())].sort();
  const data = names.reduce((acc, name) => acc + name + form.getAll(name).join(""), address);
  return createHmac("sha1", token).update(data, "utf8").digest("base64");
}

/** A call as Twilio announces it: from the SIP domain, with Meta's headers (a WhatsApp call). */
function voice(params: Record<string, string>, token?: string) {
  const form = new URLSearchParams({
    CallSid: "CA1",
    From: `sip:${CALLER}@wa.meta.vc`,
    To: "sip:+4366012345@wizards.sip.twilio.com",
    SipDomain: "wizards.sip.twilio.com",
    ...params,
  });
  return app.fetch(
    new Request(voiceWebhook, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": twilioSignature(voiceWebhook, form, token),
      },
      body: form.toString(),
    }),
  );
}

/** What OpenAI posts about an incoming call, signed as Standard Webhooks do. */
function incoming(callId: string, headers: Record<string, string>, secret = SECRET_BYTES) {
  const body = JSON.stringify({
    id: `evt_${callId}`,
    type: "realtime.call.incoming",
    data: {
      call_id: callId,
      sip_headers: Object.entries(headers).map(([name, value]) => ({ name, value })),
    },
  });
  const id = `msg_${callId}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret).update(`${id}.${timestamp}.${body}`).digest("base64");
  return app.fetch(
    new Request(openaiWebhook, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "webhook-id": id,
        "webhook-timestamp": timestamp,
        "webhook-signature": `v1,${signature}`,
      },
      body,
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
  globalThis.WebSocket = realSocket;
});

describe("connecting the accounts", () => {
  it("the runner hands off at the photo, and is ready once the accounts are there", async () => {
    const before = await json(send("GET", `/api/studio/wizards/${damageId}/runners`));
    const runner = before.runners.find((r: { id: string }) => r.id === "call");
    expect(runner).toMatchObject({ kind: "channel", label: { de: "Anruf" }, fit: { outcome: "handoff" } });
    expect(runner.problem).toMatch(/Anrufe/);
    const saved = await json(
      send("PUT", plugin("/account"), {
        twilioSid: "ACtest",
        twilioToken: TWILIO_TOKEN,
        smsFrom: "+43 660 99999",
        openaiProject: "proj_test",
        openaiWebhookSecret: OPENAI_SECRET,
        region: "eu",
      }),
    );
    expect(saved).toMatchObject({
      connected: true,
      hasToken: true,
      hasSecret: true,
      smsFrom: "+4366099999",
      sipUri: "sip:proj_test@sip-eu.api.openai.com;transport=tls",
    });
    voiceWebhook = saved.voiceWebhook;
    openaiWebhook = saved.openaiWebhook;
    // The speech model runs on the tenant's OpenAI key, set under Models; nothing is called with it here.
    expect((await send("PUT", "/api/studio/local/models", { keys: { openai: "sk-test" } })).status).toBe(200);
    expect(voiceWebhook).toMatch(/\/api\/public\/plugins\/calls\/[^/]+\/voice$/);
    expect(openaiWebhook).toMatch(/\/api\/public\/plugins\/calls\/[^/]+\/openai$/);
    const after = await json(send("GET", `/api/studio/wizards/${damageId}/runners`));
    expect(after.runners.find((r: { id: string }) => r.id === "call").problem).toBeNull();
    expect(
      (
        await send("PATCH", `/api/studio/wizards/${damageId}`, {
          runners: { default: "steps", enabled: ["steps", "chat", "call"] },
        })
      ).status,
    ).toBe(200);
  });
});

describe("a WhatsApp call", () => {
  let token = "";

  it("Twilio's voice webhook hands the call to OpenAI over SIP, with a token in a header", async () => {
    expect((await voice({}, "someone-else")).status).toBe(403);
    const res = await voice({ "SipHeader_x-wa-meta-wacid": "wacid-1" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/xml");
    const twiml = await res.text();
    const match = twiml.match(
      /<Sip>sip:proj_test@sip-eu\.api\.openai\.com;transport=tls\?x-engenty-call=([A-Za-z0-9_-]+)<\/Sip>/,
    );
    expect(match, twiml).toBeTruthy();
    token = match![1];
  });

  it("OpenAI's incoming call is picked up with the wizard's rules, and the model hears the state", async () => {
    expect((await incoming("rtc_x", { "x-engenty-call": token }, Buffer.from("wrong"))).status).toBe(401);
    expect((await incoming("rtc_unknown", { "x-engenty-call": "nope" })).status).toBe(200);
    expect(openai.at(-1)?.path).toBe("/realtime/calls/rtc_unknown/reject");
    expect((await incoming("rtc_1", { From: `sip:${CALLER}@wa.meta.vc`, "x-engenty-call": token })).status).toBe(200);
    const accept = openai.find((c) => c.path === "/realtime/calls/rtc_1/accept");
    expect(accept).toBeTruthy();
    expect(accept!.body).toMatchObject({ type: "realtime", model: expect.any(String) });
    expect(accept!.body.instructions).toContain("Du bist Schadensmeldung.");
    expect(accept!.body.instructions).toContain("send_link");
    expect(accept!.body.tools.map((t: { name: string }) => t.name)).toContain("set_field");
    expect(FakeSocket.last!.url).toBe("wss://api.openai.com/v1/realtime?call_id=rtc_1");
    expect(FakeSocket.last!.protocols).toContain("openai-insecure-api-key.sk-test");
    const [state, turn] = await sentEvents(2);
    expect(state.type).toBe("conversation.item.create");
    expect(state.item.content[0].text).toMatch(/^\[state\]\nStatus: waiting_input\.\nPage "Wer"/);
    expect(state.item.content[0].text).toContain('- kind "Art" (select: Rohr | Dach | Sonstiges, required): open');
    expect(turn).toMatchObject({ type: "response.create" });
    const run = await client.withTenant(LOCAL, () =>
      client.db.query.run.findMany({ where: (r, { eq }) => eq(r.wizardId, damageId) }),
    );
    expect(run).toHaveLength(1);
    expect(run[0]).toMatchObject({ runner: "call", mode: "live" });
  });

  it("the model fills the page with tools; a wrong choice is refused with the options", async () => {
    expect(await toolCall("set_field", { field: "name", value: "Ada" })).toContain('"Name" (text, required): answered: "Ada"');
    expect(await toolCall("set_field", { field: "kind", value: "Fenster" })).toBe("Pick one of: Rohr | Dach | Sonstiges.");
    expect(await toolCall("submit_page")).toMatch(/^Still open: kind "Art"/);
    await toolCall("set_field", { field: "kind", value: "dach" });
    await toolCall("set_field", { field: "urgent", value: "ja" });
    const next = await toolCall("submit_page");
    expect(next).toContain('Page "Nachweis"');
    expect(next).toContain('"Foto" (image, required — needs the screen: send_link): open');
  });

  it("a page that needs the screen is texted as a link; filled there, the model hears the end", async () => {
    expect(await toolCall("submit_page")).toMatch(/needs the screen/);
    expect(await toolCall("send_link")).toMatch(/^The link was texted/);
    expect(texts).toHaveLength(1);
    expect(texts[0]).toMatchObject({ to: CALLER, from: "+4366099999" });
    const link = new URL(texts[0].body.replace(/^Hier geht es weiter: /, ""));
    const runId = link.pathname.split("/").pop()!;
    const ticket = link.searchParams.get("rt")!;
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
    const [state] = await sentEvents(2);
    expect(state.item.content[0].text).toMatch(/^\[state\]\nStatus: done\./);
    // The result went out as a text by itself.
    expect(texts).toHaveLength(2);
    expect(texts[1].body).toMatch(/^Fertig! Alles liegt hier: http:\/\/localhost:5181\/w\//);
    const run = await client.withTenant(LOCAL, () =>
      client.db.query.run.findFirst({ where: (r, { eq }) => eq(r.id, runId) }),
    );
    expect(run!.state.values).toMatchObject({ name: "Ada", kind: "Dach", urgent: true });
    expect(await toolCall("hang_up")).toBe("The call is over.");
    expect(openai.at(-1)?.path).toBe("/realtime/calls/rtc_1/hangup");
  });
});
