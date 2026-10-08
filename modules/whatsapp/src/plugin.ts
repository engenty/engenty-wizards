import { definePlugin, type PluginRequest } from "@engenty-wizards/plugin-sdk";
import { z } from "zod";
import { Door, freshState, type Offered, RUNNER, type Thread } from "./door";
import { Graph, GraphError } from "./graph";
import { type Inbound, parseWebhook, signatureOk } from "./inbound";
import {
  dropAccount,
  getAccount,
  keywordOf,
  keywords,
  loadThread,
  putAccount,
  saveThread,
  setKeyword,
  threadByRun,
  waLink,
} from "./store";

/**
 * WhatsApp as a door: the tenant connects its business number (Meta's Cloud API), the owner
 * switches the runner on per wizard and gets a keyword; a person writes the keyword to the
 * number and runs the wizard in the thread. The webhook is a public route; everything the
 * thread does goes through the run API. The studio half is ui/plugin.tsx.
 */

const fail = (status: number, code: string, message: string): never => {
  throw Object.assign(new Error(message), { status, code });
};

const accountInput = z.object({
  phoneNumberId: z.string().trim().min(1).max(40),
  number: z.string().trim().min(5).max(20),
  accessToken: z.string().trim().max(1000).optional(),
  appSecret: z.string().trim().max(200).nullable().optional(),
  template: z.string().trim().max(512).nullable().optional(),
});

export default definePlugin((wizards) => {
  const { server, log } = wizards;
  const db = () => server.getTenantDb();

  server.registerMigrations("migrations");

  // One turn per thread at a time: a webhook, a run's signal and a retry never interleave.
  const turns = new Map<string, Promise<void>>();
  function turn(key: string, work: () => Promise<void>): Promise<void> {
    const next = (turns.get(key) ?? Promise.resolve())
      .catch(() => undefined)
      .then(work)
      .catch((err) => log.error(`thread ${key}:`, err));
    turns.set(key, next);
    void next.finally(() => {
      if (turns.get(key) === next) {
        turns.delete(key);
      }
    });
    return next;
  }

  // The runs the threads listen to, with what stops the listening.
  const watching = new Map<string, () => void>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const door = new Door({
    runs: server.runs,
    account: () => getAccount(db()),
    offered: () => server.runs.wizards(RUNNER) as Promise<Offered[]>,
    keywords: () => keywords(db()),
    watch(thread) {
      const runId = thread.runId;
      if (!runId || watching.has(runId)) {
        return;
      }
      const { waId } = thread;
      const stop = server.runs.subscribe(runId, (signal) => {
        // Only a step that ended or a change of status moves the thread; a burst is one look.
        if (signal.event && signal.event.type !== "step_done" && signal.event.type !== "error") {
          return;
        }
        clearTimeout(timers.get(runId));
        timers.set(
          runId,
          setTimeout(() => {
            timers.delete(runId);
            void turn(waId, () => resume(waId));
          }, 300),
        );
      });
      watching.set(runId, stop);
    },
    unwatch(runId) {
      watching.get(runId)?.();
      watching.delete(runId);
      clearTimeout(timers.get(runId));
      timers.delete(runId);
    },
    log,
  });
  server.onUnload(() => {
    for (const stop of watching.values()) {
      stop();
    }
    watching.clear();
    for (const timer of timers.values()) {
      clearTimeout(timer);
    }
  });

  async function handle(msg: Inbound): Promise<void> {
    const thread: Thread = (await loadThread(db(), msg.from)) ?? {
      waId: msg.from,
      name: msg.name,
      runId: null,
      state: freshState(),
      lastInboundAt: msg.at,
      lastMessageId: null,
    };
    if (thread.lastMessageId === msg.id) {
      // Meta posts a webhook again when the answer was slow: the message was dealt with.
      return;
    }
    thread.lastMessageId = msg.id;
    thread.lastInboundAt = Math.max(thread.lastInboundAt, msg.at);
    if (msg.name) {
      thread.name = msg.name;
    }
    try {
      await door.inbound(thread, msg);
    } finally {
      await saveThread(db(), thread);
    }
  }

  async function resume(waId: string): Promise<void> {
    const thread = await loadThread(db(), waId);
    if (!thread) {
      return;
    }
    try {
      await door.resume(thread);
    } finally {
      await saveThread(db(), thread);
    }
  }

  // ── The door ───────────────────────────────────────────────────────────────

  server.registerRunner({
    id: RUNNER,
    label: { de: "WhatsApp", en: "WhatsApp" },
    kind: "channel",
    capabilities: {
      input: [
        "text",
        "textarea",
        "number",
        "select",
        "multiselect",
        "date",
        "email",
        "url",
        "toggle",
        "image",
        "file",
        "location",
        "audio",
      ],
      output: {
        shows: ["text", "data", "image", "video", "voice", "document", "film"],
        pictures: ["dashboard", "widget"],
      },
      asks: ["confirm"],
      review: ["accept", "regenerate"],
      waits: true,
      handoff: ["thread"],
    },
    problem: async () =>
      (await getAccount(db())) ? null : "Keine Nummer verbunden (Einstellungen → WhatsApp)",
  });

  // Meta checks the address once, with the verify token the settings show.
  server.registerPublicRoute({
    method: "GET",
    path: "/webhook",
    handler: async ({ query }) => {
      const account = await getAccount(db());
      if (
        account &&
        query.get("hub.mode") === "subscribe" &&
        query.get("hub.verify_token") === account.verifyToken
      ) {
        return new Response(query.get("hub.challenge") ?? "", {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      }
      return fail(403, "forbidden", "The verify token does not match.");
    },
  });

  // What people write: answered at once, dealt with in the thread's own turn.
  server.registerPublicRoute({
    method: "POST",
    path: "/webhook",
    handler: async ({ request }) => {
      const account = await getAccount(db());
      if (!account) {
        return { ok: true };
      }
      const raw = await request.text();
      if (
        account.appSecret &&
        !signatureOk(account.appSecret, raw, request.headers.get("x-hub-signature-256"))
      ) {
        return fail(403, "bad_signature", "The signature does not match.");
      }
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return fail(400, "bad_body", "Not JSON.");
      }
      for (const msg of parseWebhook(body)) {
        if (msg.phoneNumberId && msg.phoneNumberId !== account.phoneNumberId) {
          continue;
        }
        void turn(msg.from, () => handle(msg));
      }
      return { ok: true };
    },
  });

  // A run that ended while nobody listened (the runtime was restarted): told on its own.
  for (const event of ["run.done", "run.failed"] as const) {
    server.on(event, async ({ run }) => {
      if (run.mode !== "live") {
        return;
      }
      const thread = await threadByRun(db(), run.id);
      if (thread && !thread.state.delivered) {
        await turn(thread.waId, () => resume(thread.waId));
      }
    });
  }

  // ── The studio's side ──────────────────────────────────────────────────────

  const admin = (request: PluginRequest) => {
    if (request.user.role === "member") {
      fail(403, "forbidden", "Owners and admins only.");
    }
  };

  async function accountView() {
    const account = await getAccount(db());
    return {
      connected: Boolean(account),
      phoneNumberId: account?.phoneNumberId ?? "",
      number: account?.number ?? "",
      hasToken: Boolean(account?.accessToken),
      hasSecret: Boolean(account?.appSecret),
      template: account?.template ?? "",
      verifyToken: account?.verifyToken ?? null,
      webhook: await server.publicUrl("/webhook"),
    };
  }

  server.registerHttpRoute({
    method: "GET",
    path: "/account",
    role: "admin",
    handler: accountView,
  });

  server.registerHttpRoute({
    method: "PUT",
    path: "/account",
    role: "admin",
    handler: async (request) => {
      admin(request);
      const parsed = accountInput.safeParse(await request.json());
      if (!parsed.success) {
        return fail(400, "invalid", parsed.error.issues[0]?.message ?? "invalid");
      }
      await putAccount(db(), parsed.data);
      return accountView();
    },
  });

  server.registerHttpRoute({
    method: "DELETE",
    path: "/account",
    role: "admin",
    handler: async (request) => {
      admin(request);
      await dropAccount(db());
      return accountView();
    },
  });

  // A word to a number of one's own: the token and the number id are right when it arrives.
  server.registerHttpRoute({
    method: "POST",
    path: "/account/test",
    role: "admin",
    handler: async (request) => {
      admin(request);
      const account = await getAccount(db());
      if (!account) {
        return fail(409, "not_connected", "No number is connected.");
      }
      const { to } = (await request.json()) as { to?: string };
      const number = String(to ?? "").replace(/\D/g, "");
      if (number.length < 5) {
        return fail(400, "invalid", "A number with its country code.");
      }
      try {
        const id = await new Graph(account).send(number, {
          type: "text",
          text: "✓ engenty wizards",
        });
        return { ok: true, id };
      } catch (err) {
        return fail(
          502,
          "provider",
          err instanceof GraphError ? err.message : "The message was not sent.",
        );
      }
    },
  });

  // The keyword a wizard answers to, and the link that writes it.
  async function bindingView(wizardId: string) {
    const account = await getAccount(db());
    const offered = (await server.runs.wizards(RUNNER)) as Offered[];
    const title = offered.find((w) => w.wizardId === wizardId)?.title ?? "wizard";
    const keyword = await keywordOf(db(), wizardId, title);
    return {
      keyword,
      link: account ? waLink(account.number, keyword) : null,
      number: account?.number ?? null,
    };
  }

  server.registerHttpRoute({
    method: "GET",
    path: "/binding/:wizardId",
    handler: ({ params }) => bindingView(params.wizardId),
  });

  server.registerHttpRoute({
    method: "PUT",
    path: "/binding/:wizardId",
    handler: async (request) => {
      const { keyword } = (await request.json()) as { keyword?: string };
      await setKeyword(db(), request.params.wizardId, String(keyword ?? ""));
      return bindingView(request.params.wizardId);
    },
  });
});
