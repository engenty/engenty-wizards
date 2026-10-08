import { definePlugin, type PluginRequest } from "@engenty-wizards/plugin-sdk";
import {
  freshThreadState,
  type Thread,
  ThreadDoor,
  type ThreadInbound,
  type ThreadWizard,
} from "@engenty-wizards/plugin-sdk/thread";
import { z } from "zod";
import {
  dropAccount,
  getAccount,
  keywordOf,
  keywords,
  loadThread,
  putAccount,
  saveThread,
  setKeyword,
  smsLink,
  threadByRun,
} from "./store";
import { ASKS, RUNNER, smsSurface } from "./surface";
import { e164, parseInbound, signatureOk, Twilio, TwilioError } from "./twilio";

/**
 * SMS as a door: the tenant connects its Twilio account and number, the owner switches the
 * runner on per wizard and gets a keyword; a person texts the keyword to the number and runs
 * the wizard in texts. The conversation itself is the SDK's thread door (surface.ts says how
 * it reads as text); this file is the webhook, the rows and the studio's routes. The studio
 * half is ui/plugin.tsx.
 */

const fail = (status: number, code: string, message: string): never => {
  throw Object.assign(new Error(message), { status, code });
};

/** An empty TwiML answer: Twilio expects one, and sends nothing of its own. */
const TWIML = new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
  headers: { "content-type": "text/xml" },
});

const accountInput = z.object({
  accountSid: z.string().trim().min(1).max(60),
  number: z.string().trim().min(5).max(20),
  authToken: z.string().trim().max(200).optional(),
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

  const watching = new Map<string, () => void>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  /** The wizards switched on for SMS, each with its keyword. */
  async function offered(): Promise<ThreadWizard[]> {
    const on = await server.runs.wizards(RUNNER);
    const words = await keywords(db());
    return Promise.all(
      on.map(async (w) => ({
        ...w,
        keyword: words.get(w.wizardId) ?? (await keywordOf(db(), w.wizardId, w.title)),
      })),
    );
  }

  const door = new ThreadDoor({
    runs: server.runs,
    surface: smsSurface({ account: () => getAccount(db()) }),
    offered,
    watch(thread) {
      const runId = thread.runId;
      if (!runId || watching.has(runId)) {
        return;
      }
      const { id } = thread;
      const stop = server.runs.subscribe(runId, (signal) => {
        if (signal.event && signal.event.type !== "step_done" && signal.event.type !== "error") {
          return;
        }
        clearTimeout(timers.get(runId));
        timers.set(
          runId,
          setTimeout(() => {
            timers.delete(runId);
            void turn(id, () => resume(id));
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

  async function handle(msg: ThreadInbound): Promise<void> {
    const thread: Thread = (await loadThread(db(), msg.from)) ?? {
      id: msg.from,
      name: null,
      runId: null,
      state: freshThreadState(),
      lastInboundAt: msg.at,
      lastMessageId: null,
    };
    if (thread.lastMessageId === msg.id) {
      // Twilio posts again when the answer was slow: the message was dealt with.
      return;
    }
    thread.lastMessageId = msg.id;
    thread.lastInboundAt = Math.max(thread.lastInboundAt, msg.at);
    try {
      await door.inbound(thread, msg);
    } finally {
      await saveThread(db(), thread);
    }
  }

  async function resume(id: string): Promise<void> {
    const thread = await loadThread(db(), id);
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
    label: { de: "SMS", en: "SMS" },
    kind: "channel",
    capabilities: {
      input: ASKS,
      output: { shows: ["text", "data"], pictures: [] },
      asks: ["confirm"],
      review: ["accept", "regenerate"],
      waits: true,
      handoff: ["sms"],
    },
    problem: async () =>
      (await getAccount(db())) ? null : "Keine Nummer verbunden (Einstellungen → SMS)",
  });

  // What people text: Twilio posts a form; answered with empty TwiML, dealt with in the thread's turn.
  server.registerPublicRoute({
    method: "POST",
    path: "/webhook",
    handler: async ({ request }) => {
      const account = await getAccount(db());
      if (!account) {
        return TWIML.clone();
      }
      const form = new URLSearchParams(await request.text());
      const urls = [await server.publicUrl("/webhook"), request.url];
      if (!signatureOk(account.authToken, urls, form, request.headers.get("x-twilio-signature"))) {
        return fail(403, "bad_signature", "The signature does not match.");
      }
      const msg = parseInbound(form);
      if (msg) {
        void turn(msg.from, () => handle(msg));
      }
      return TWIML.clone();
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
        await turn(thread.id, () => resume(thread.id));
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
      accountSid: account?.accountSid ?? "",
      number: account?.number ?? "",
      hasToken: Boolean(account?.authToken),
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

  // A text to a number of one's own: the account and the number are right when it arrives.
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
      const number = e164(String(to ?? ""));
      if (number.length < 6) {
        return fail(400, "invalid", "A number with its country code.");
      }
      try {
        const id = await new Twilio(account).send(number, "✓ engenty wizards");
        return { ok: true, id };
      } catch (err) {
        return fail(
          502,
          "provider",
          err instanceof TwilioError ? err.message : "The text was not sent.",
        );
      }
    },
  });

  // The keyword a wizard answers to, and the link that types it.
  async function bindingView(wizardId: string) {
    const account = await getAccount(db());
    const on = await server.runs.wizards(RUNNER);
    const title = on.find((w) => w.wizardId === wizardId)?.title ?? "wizard";
    const keyword = await keywordOf(db(), wizardId, title);
    return {
      keyword,
      link: account ? smsLink(account.number, keyword) : null,
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
