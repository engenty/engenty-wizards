import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * OpenAI speaks: a call reaches its SIP endpoint, it posts `realtime.call.incoming`, this
 * plugin accepts the call with the wizard's rules and tools, and drives the conversation over
 * a WebSocket to the same session. The audio never touches the runtime.
 */

export const OPENAI = "https://api.openai.com/v1";

/** Where Twilio sends the call: the project at OpenAI's SIP endpoint, in the EU or the US. */
export function sipUri(project: string, region: "eu" | "us"): string {
  const host = region === "eu" ? "sip-eu.api.openai.com" : "sip.api.openai.com";
  return `sip:${project}@${host};transport=tls`;
}

/** Only a signature of five minutes or so counts; a replay from a kept body does not. */
const WEBHOOK_TOLERANCE_SECONDS = 300;

/**
 * Standard Webhooks, as OpenAI signs: `webhook-signature` holds `v1,<base64 HMAC-SHA256>` of
 * `<webhook-id>.<webhook-timestamp>.<body>`, the key being the secret after `whsec_`, base64.
 */
export function webhookOk(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  raw: string,
  now = Date.now(),
): boolean {
  if (!headers.id || !headers.timestamp || !headers.signature) {
    return false;
  }
  const at = Number(headers.timestamp);
  if (!Number.isFinite(at) || Math.abs(now / 1000 - at) > WEBHOOK_TOLERANCE_SECONDS) {
    return false;
  }
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = Buffer.from(
    createHmac("sha256", key)
      .update(`${headers.id}.${headers.timestamp}.${raw}`, "utf8")
      .digest("base64"),
  );
  return headers.signature.split(" ").some((part) => {
    const [version, signature] = part.split(",");
    const given = Buffer.from(signature ?? "");
    return version === "v1" && given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export interface IncomingCall {
  callId: string;
  headers: Map<string, string>;
}

/** The call OpenAI announces, with its SIP headers by lower-case name; null for any other event. */
export function incomingCall(body: unknown): IncomingCall | null {
  const event = body as {
    type?: string;
    data?: { call_id?: string; sip_headers?: { name?: string; value?: string }[] };
  } | null;
  if (event?.type !== "realtime.call.incoming" || !event.data?.call_id) {
    return null;
  }
  const headers = new Map<string, string>();
  for (const h of event.data.sip_headers ?? []) {
    if (h.name && typeof h.value === "string") {
      headers.set(h.name.toLowerCase(), h.value);
    }
  }
  return { callId: event.data.call_id, headers };
}

export class OpenAIError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "OpenAIError";
  }
}

async function post(
  apiKey: string,
  path: string,
  body: unknown,
  fetchImpl: typeof fetch,
): Promise<void> {
  const res = await fetchImpl(`${OPENAI}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new OpenAIError(`OpenAI answered ${res.status}: ${detail}`, res.status);
  }
}

export interface CallSessionConfig {
  model: string;
  instructions: string;
  tools: unknown[];
  voice: string;
}

/** Picks the call up with the wizard's rules; the person hears the model from here on. */
export function acceptCall(
  apiKey: string,
  callId: string,
  config: CallSessionConfig,
  fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args),
): Promise<void> {
  return post(
    apiKey,
    `/realtime/calls/${encodeURIComponent(callId)}/accept`,
    {
      type: "realtime",
      model: config.model,
      instructions: config.instructions,
      tools: config.tools,
      tool_choice: "auto",
      audio: { output: { voice: config.voice } },
    },
    fetchImpl,
  );
}

export function rejectCall(
  apiKey: string,
  callId: string,
  fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args),
): Promise<void> {
  return post(apiKey, `/realtime/calls/${encodeURIComponent(callId)}/reject`, {}, fetchImpl);
}

export function hangUp(
  apiKey: string,
  callId: string,
  fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args),
): Promise<void> {
  return post(apiKey, `/realtime/calls/${encodeURIComponent(callId)}/hangup`, undefined, fetchImpl);
}

/**
 * The WebSocket to the accepted call. Node's own client takes no headers, so the key goes the
 * way a browser's does: as a sub-protocol.
 */
export function openSocket(apiKey: string, callId: string): WebSocket {
  return new WebSocket(`wss://api.openai.com/v1/realtime?call_id=${encodeURIComponent(callId)}`, [
    "realtime",
    `openai-insecure-api-key.${apiKey}`,
  ]);
}
