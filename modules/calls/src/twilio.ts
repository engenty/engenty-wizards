import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Twilio carries the call: a SIP domain takes Meta's INVITE (a WhatsApp call), a Twilio number
 * takes a phone call, and either asks this plugin for TwiML. The same account texts the links.
 */

export const API = "https://api.twilio.com/2010-04-01";

export interface TwilioAccount {
  sid: string;
  token: string;
}

export class TwilioError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TwilioError";
  }
}

/** A number as a phone writes it: +, then digits. `sip:+43…@host` gives the same. */
export function e164(raw: string): string {
  const user = raw.replace(/^sips?:/, "").split("@")[0];
  const digits = user.replace(/[^\d]/g, "");
  return `+${digits}`;
}

/** Sends one text, from the number the call came in on. */
export async function sendText(
  account: TwilioAccount,
  from: string,
  to: string,
  body: string,
  fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args),
): Promise<void> {
  const res = await fetchImpl(`${API}/Accounts/${encodeURIComponent(account.sid)}/Messages.json`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${account.sid}:${account.token}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const text = await res.text();
    let message = `Twilio answered ${res.status}.`;
    try {
      message = (JSON.parse(text) as { message?: string }).message ?? message;
    } catch {
      // Not JSON: the status says enough.
    }
    throw new TwilioError(message, res.status);
  }
}

/** `X-Twilio-Signature`: HMAC-SHA1, base64, of the address with the sorted form fields appended. */
export function signatureOk(
  token: string,
  urls: string[],
  form: URLSearchParams,
  header: string | null,
): boolean {
  if (!header) {
    return false;
  }
  const given = Buffer.from(header);
  const names = [...new Set(form.keys())].sort();
  return urls.some((url) => {
    const data = names.reduce((acc, name) => acc + name + form.getAll(name).join(""), url);
    const expected = Buffer.from(createHmac("sha1", token).update(data, "utf8").digest("base64"));
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
}

/** TwiML that hands the call to a SIP address, with a header that names the call to us. */
export function dialTwiml(sipUri: string, token: string): string {
  const uri = `${sipUri}?x-engenty-call=${encodeURIComponent(token)}`;
  const safe = uri.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Dial answerOnBridge="true"><Sip>${safe}</Sip></Dial></Response>`;
}

export const emptyTwiml = () =>
  new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { "content-type": "text/xml" },
  });
