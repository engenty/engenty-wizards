import { createHmac, timingSafeEqual } from "node:crypto";
import type { ThreadInbound } from "@engenty-wizards/plugin-sdk/thread";

/**
 * Twilio's messaging API, the part this plugin uses: sending a text to a number, reading
 * what Twilio posts when one arrives, and checking that it was Twilio who posted it.
 */

export const API = "https://api.twilio.com/2010-04-01";

export interface Account {
  accountSid: string;
  authToken: string;
  /** E.164: +43660… */
  number: string;
}

/** A text may hold up to 1600 characters over several segments; longer is cut. */
export const TEXT_LIMIT = 1500;

export class TwilioError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: number | null,
  ) {
    super(message);
    this.name = "TwilioError";
  }
}

/** A number as Twilio and the person's phone write it: +, then digits. */
export function e164(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? `+${digits.slice(1).replace(/\+/g, "")}` : `+${digits}`;
}

export class Twilio {
  constructor(
    private readonly account: Account,
    private readonly fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args),
  ) {}

  /** Sends one text; gives the message's sid. */
  async send(to: string, body: string): Promise<string | null> {
    const form = new URLSearchParams({
      To: to,
      From: this.account.number,
      Body: body.length > TEXT_LIMIT ? `${body.slice(0, TEXT_LIMIT - 1)}…` : body,
    });
    const res = await this.fetchImpl(
      `${API}/Accounts/${encodeURIComponent(this.account.accountSid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${this.account.accountSid}:${this.account.authToken}`).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
        signal: AbortSignal.timeout(20_000),
      },
    );
    const text = await res.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      parsed = {};
    }
    if (!res.ok) {
      throw new TwilioError(
        typeof parsed.message === "string" ? parsed.message : `Twilio answered ${res.status}.`,
        res.status,
        typeof parsed.code === "number" ? parsed.code : null,
      );
    }
    return typeof parsed.sid === "string" ? parsed.sid : null;
  }
}

/**
 * `X-Twilio-Signature` is the HMAC-SHA1, base64, of the address Twilio posted to with every
 * form field appended, sorted by name, each as name then value.
 */
export function signatureOf(authToken: string, url: string, form: URLSearchParams): string {
  const names = [...new Set(form.keys())].sort();
  const data = names.reduce((acc, name) => acc + name + form.getAll(name).join(""), url);
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

export function signatureOk(
  authToken: string,
  urls: string[],
  form: URLSearchParams,
  header: string | null,
): boolean {
  if (!header) {
    return false;
  }
  const given = Buffer.from(header);
  return urls.some((url) => {
    const expected = Buffer.from(signatureOf(authToken, url, form));
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
}

/** What Twilio posted, as the thread door reads a message. Null for a status callback. */
export function parseInbound(form: URLSearchParams): ThreadInbound | null {
  const id = form.get("MessageSid") || form.get("SmsSid");
  const from = form.get("From");
  if (!id || !from || form.get("MessageStatus")) {
    return null;
  }
  const body = (form.get("Body") ?? "").trim();
  const count = Number(form.get("NumMedia") ?? 0) || 0;
  const first = count ? form.get("MediaUrl0") : null;
  const mime = count ? (form.get("MediaContentType0") ?? "application/octet-stream") : "";
  const base = { id, from, name: form.get("ProfileName") || null, at: Date.now() };
  if (first) {
    const kind = mime.startsWith("image/")
      ? "image"
      : mime.startsWith("video/")
        ? "video"
        : mime.startsWith("audio/")
          ? "audio"
          : "document";
    return { ...base, kind, media: { id: first, mime, caption: body || undefined }, text: body };
  }
  return { ...base, kind: "text", text: body };
}
