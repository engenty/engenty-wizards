import { AsyncResource } from "node:async_hooks";
import { definePlugin, type PluginRequest } from "@engenty-wizards/plugin-sdk";
import { z } from "zod";
import {
  acceptCall,
  hangUp,
  incomingCall,
  openSocket,
  rejectCall,
  sipUri,
  webhookOk,
} from "./openai";
import { ASKS, CALL_TOOLS, instructions, RUNNER, VOICES } from "./rules";
import { CallSession, type Offered } from "./session";
import { callByToken, dropAccount, getAccount, newCall, putAccount, updateCall } from "./store";
import { dialTwiml, e164, emptyTwiml, sendText, signatureOk } from "./twilio";

/**
 * Calls as a door. A WhatsApp call reaches the tenant's business number, Meta sends it as SIP
 * to the tenant's Twilio SIP domain; a phone call reaches the tenant's Twilio number. Either
 * way Twilio asks this plugin for TwiML, which hands the call to the tenant's OpenAI project
 * over SIP with a token in a header. OpenAI posts the incoming call here; the plugin picks it
 * up with the wizard's rules and tools and drives the run over a WebSocket while the person
 * and the model talk. The studio half is ui/plugin.tsx.
 */

const fail = (status: number, code: string, message: string): never => {
  throw Object.assign(new Error(message), { status, code });
};

const accountInput = z.object({
  twilioSid: z.string().trim().min(1).max(60),
  twilioToken: z.string().trim().max(200).optional(),
  smsFrom: z.string().trim().max(20).nullable().optional(),
  openaiProject: z.string().trim().min(1).max(80),
  openaiWebhookSecret: z.string().trim().max(200).optional(),
  region: z.enum(["eu", "us"]),
});

/** A form field by its name, whatever the case Twilio and Meta used. */
function field(form: URLSearchParams, name: string): string | null {
  const lower = name.toLowerCase();
  for (const [key, value] of form) {
    if (key.toLowerCase() === lower) {
      return value;
    }
  }
  return null;
}

export default definePlugin((wizards) => {
  const { server, log } = wizards;
  const db = () => server.getTenantDb();

  server.registerMigrations("migrations");

  interface Live {
    session: CallSession;
    socket: WebSocket;
  }
  const live = new Map<string, Live>();
  const watching = new Map<string, () => void>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const offered = () => server.runs.wizards(RUNNER) as Promise<Offered[]>;

  function watch(runId: string) {
    if (watching.has(runId)) {
      return;
    }
    const stop = server.runs.subscribe(runId, (signal) => {
      if (signal.event && signal.event.type !== "step_done" && signal.event.type !== "error") {
        return;
      }
      clearTimeout(timers.get(runId));
      timers.set(
        runId,
        setTimeout(() => {
          timers.delete(runId);
          for (const { session } of live.values()) {
            if (session.runId === runId) {
              void session.changed().catch((err) => log.error("after a change of the run:", err));
            }
          }
        }, 300),
      );
    });
    watching.set(runId, stop);
  }

  function unwatch(runId: string) {
    watching.get(runId)?.();
    watching.delete(runId);
    clearTimeout(timers.get(runId));
    timers.delete(runId);
  }

  server.onUnload(() => {
    for (const { socket } of live.values()) {
      socket.close();
    }
    live.clear();
    for (const stop of watching.values()) {
      stop();
    }
    watching.clear();
    for (const timer of timers.values()) {
      clearTimeout(timer);
    }
  });

  // ── The door ───────────────────────────────────────────────────────────────

  server.registerRunner({
    id: RUNNER,
    label: { de: "Anruf", en: "Call" },
    kind: "channel",
    capabilities: {
      input: ASKS,
      output: { shows: ["text", "data"], pictures: [] },
      asks: ["confirm"],
      review: ["accept", "regenerate"],
      waits: true,
      handoff: ["sms"],
    },
    problem: async () => {
      if (!(await getAccount(db()))) {
        return "Keine Nummer verbunden (Einstellungen → Anrufe)";
      }
      try {
        await server.speech.conversation();
        return null;
      } catch (err) {
        return (err as Error).message;
      }
    },
  });

  // Twilio: a call came in on the SIP domain (WhatsApp) or on the number (phone). The TwiML
  // hands it to OpenAI's SIP endpoint with a token that names the call to us.
  server.registerPublicRoute({
    method: "POST",
    path: "/voice",
    handler: async ({ request }) => {
      const account = await getAccount(db());
      if (!account) {
        return emptyTwiml();
      }
      const form = new URLSearchParams(await request.text());
      const urls = [await server.publicUrl("/voice"), request.url];
      if (
        !signatureOk(account.twilioToken, urls, form, request.headers.get("x-twilio-signature"))
      ) {
        return fail(403, "bad_signature", "The signature does not match.");
      }
      const caller = e164(form.get("From") ?? "");
      if (caller.length < 6) {
        return fail(400, "no_caller", "No caller.");
      }
      const wacid = field(form, "SipHeader_x-wa-meta-wacid");
      const payload =
        field(form, "SipHeader_x-wa-meta-cta-payload") ??
        field(form, "SipHeader_x-wa-meta-deeplink-payload");
      const row = await newCall(db(), {
        caller,
        channel: wacid ? "whatsapp" : "phone",
        payload,
        twilioCallSid: form.get("CallSid"),
      });
      return new Response(dialTwiml(sipUri(account.openaiProject, account.region), row.token), {
        headers: { "content-type": "text/xml" },
      });
    },
  });

  // OpenAI: the call reached the project. Picked up with the wizard's rules; from here on the
  // model speaks and this plugin answers its tool calls over the WebSocket.
  server.registerPublicRoute({
    method: "POST",
    path: "/openai",
    handler: async ({ request }) => {
      const account = await getAccount(db());
      if (!account) {
        return fail(404, "not_connected", "No account.");
      }
      const raw = await request.text();
      const h = (name: string) => request.headers.get(name);
      if (
        !webhookOk(
          account.openaiWebhookSecret,
          {
            id: h("webhook-id"),
            timestamp: h("webhook-timestamp"),
            signature: h("webhook-signature"),
          },
          raw,
        )
      ) {
        return fail(401, "bad_signature", "The signature does not match.");
      }
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return fail(400, "bad_body", "Not JSON.");
      }
      const incoming = incomingCall(body);
      if (!incoming) {
        return { ok: true };
      }
      const { apiKey, model } = await server.speech.conversation();
      const token = incoming.headers.get("x-engenty-call");
      const row = token ? await callByToken(db(), token) : null;
      if (row?.status !== "ringing") {
        // Not a call of ours, or one answered already.
        await rejectCall(apiKey, incoming.callId).catch((err) => log.warn("reject:", err));
        return { ok: true };
      }
      const on = await offered();
      const byPayload = row.payload
        ? on.find((w) => w.token === row.payload || w.wizardId === row.payload)
        : undefined;
      const first = byPayload ?? (on.length === 1 ? on[0] : null);
      const lang = first?.lang ?? on[0]?.lang ?? "de";
      let socket: WebSocket | null = null;
      const session = new CallSession(
        {
          runs: server.runs,
          send: (event) => {
            if (socket?.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify(event));
            }
          },
          text: async (body) => {
            if (!account.smsFrom) {
              throw new Error("No number to text from (Settings → Calls).");
            }
            await sendText(
              { sid: account.twilioSid, token: account.twilioToken },
              account.smsFrom,
              row.caller,
              body,
            );
          },
          hangUp: async () => {
            await hangUp(apiKey, incoming.callId).catch((err) => log.warn("hangup:", err));
            // The tool's answer still goes out; the socket closes once it did.
            setTimeout(() => socket?.close(), 1000);
          },
          watch,
          unwatch,
          log,
        },
        row.caller,
        row.channel,
        first ? [] : on,
        lang,
      );
      if (first) {
        await session.start(first);
      }
      await acceptCall(apiKey, incoming.callId, {
        model,
        instructions: instructions(
          lang,
          first ? { title: first.title } : null,
          first ? [] : on.map((w) => w.title),
        ),
        tools: [...CALL_TOOLS],
        voice: VOICES[lang],
      });
      await updateCall(db(), row.token, {
        openaiCallId: incoming.callId,
        runId: session.runId,
        status: "live",
      });
      // The socket's events arrive outside any request: bound to this call's tenant here.
      const bound = <A extends unknown[]>(fn: (...args: A) => void) => AsyncResource.bind(fn);
      socket = openSocket(apiKey, incoming.callId);
      live.set(row.token, { session, socket });
      socket.addEventListener(
        "open",
        bound(() => {
          void session.hello().catch((err) => log.error("hello:", err));
        }),
      );
      socket.addEventListener(
        "message",
        bound((event: MessageEvent) => {
          void onMessage(session, String(event.data)).catch((err) => log.error("event:", err));
        }),
      );
      socket.addEventListener(
        "close",
        bound(() => {
          session.stop();
          live.delete(row.token);
          void updateCall(db(), row.token, { status: "done" }).catch(() => undefined);
        }),
      );
      socket.addEventListener(
        "error",
        bound(() => log.warn(`call ${row.token}: the socket to the model failed`)),
      );
      return { ok: true };
    },
  });

  /** What the model sent: a tool call is run and answered; the rest is noise here. */
  async function onMessage(session: CallSession, data: string): Promise<void> {
    let event: {
      type?: string;
      name?: string;
      arguments?: string;
      call_id?: string;
      error?: unknown;
    };
    try {
      event = JSON.parse(data);
    } catch {
      return;
    }
    if (event.type === "response.function_call_arguments.done" && event.name) {
      let args: Record<string, unknown> = {};
      try {
        args = event.arguments ? (JSON.parse(event.arguments) as Record<string, unknown>) : {};
      } catch {
        args = {};
      }
      const output = await session
        .call(event.name, args)
        .catch((err) => `Failed: ${(err as Error).message}`);
      const found = [...live.values()].find((l) => l.session === session);
      if (found?.socket.readyState === WebSocket.OPEN) {
        found.socket.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: { type: "function_call_output", call_id: event.call_id, output },
          }),
        );
        found.socket.send(JSON.stringify({ type: "response.create" }));
      }
    } else if (event.type === "error") {
      log.warn("the model reported:", JSON.stringify(event.error));
    }
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
      twilioSid: account?.twilioSid ?? "",
      hasToken: Boolean(account?.twilioToken),
      smsFrom: account?.smsFrom ?? "",
      openaiProject: account?.openaiProject ?? "",
      hasSecret: Boolean(account?.openaiWebhookSecret),
      region: account?.region ?? "eu",
      voiceWebhook: await server.publicUrl("/voice"),
      openaiWebhook: await server.publicUrl("/openai"),
      sipUri: account ? sipUri(account.openaiProject, account.region) : null,
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
      await putAccount(db(), {
        ...parsed.data,
        smsFrom: parsed.data.smsFrom ? e164(parsed.data.smsFrom) : null,
      });
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
});
