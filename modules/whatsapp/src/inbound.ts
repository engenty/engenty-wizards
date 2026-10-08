import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * What Meta posts to the webhook, read into one shape per message: text, a tap on a button or
 * a row, a file, a location. Statuses (sent, delivered, read) are left out.
 */

export interface Inbound {
  id: string;
  /** The person's number, as WhatsApp names it (digits, no plus). */
  from: string;
  name: string | null;
  /** The number it was sent to, by its id. */
  phoneNumberId: string;
  at: number;
  kind: "text" | "reply" | "image" | "document" | "video" | "audio" | "location" | "other";
  text?: string;
  /** The id of the button or the row the person tapped. */
  replyId?: string;
  replyTitle?: string;
  media?: { id: string; mime: string; filename?: string; caption?: string };
  location?: { lat: number; lng: number; name?: string; address?: string };
}

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {};
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

function oneMessage(m: Rec, phoneNumberId: string, name: string | null): Inbound | null {
  const id = str(m.id);
  const from = str(m.from);
  if (!id || !from) {
    return null;
  }
  const at = Number(m.timestamp) * 1000 || Date.now();
  const base = { id, from, name, phoneNumberId, at };
  switch (m.type) {
    case "text":
      return { ...base, kind: "text", text: str(rec(m.text).body) ?? "" };
    case "interactive": {
      const i = rec(m.interactive);
      const reply = rec(i.button_reply ?? i.list_reply);
      return {
        ...base,
        kind: "reply",
        replyId: str(reply.id) ?? "",
        replyTitle: str(reply.title),
        text: str(reply.title),
      };
    }
    case "button":
      // A tap on a template's quick-reply button.
      return {
        ...base,
        kind: "reply",
        replyId: str(rec(m.button).payload) ?? "",
        text: str(rec(m.button).text),
      };
    case "image":
    case "document":
    case "video":
    case "audio": {
      const file = rec(m[m.type]);
      const mediaId = str(file.id);
      if (!mediaId) {
        return null;
      }
      return {
        ...base,
        kind: m.type,
        media: {
          id: mediaId,
          mime: str(file.mime_type) ?? "application/octet-stream",
          filename: str(file.filename),
          caption: str(file.caption),
        },
        text: str(file.caption),
      };
    }
    case "location": {
      const l = rec(m.location);
      const lat = Number(l.latitude);
      const lng = Number(l.longitude);
      if (!(Number.isFinite(lat) && Number.isFinite(lng))) {
        return null;
      }
      return {
        ...base,
        kind: "location",
        location: { lat, lng, name: str(l.name), address: str(l.address) },
      };
    }
    default:
      return { ...base, kind: "other" };
  }
}

/** Every message in a webhook's body, oldest first. */
export function parseWebhook(body: unknown): Inbound[] {
  const out: Inbound[] = [];
  const root = rec(body);
  if (root.object !== "whatsapp_business_account") {
    return out;
  }
  for (const entry of Array.isArray(root.entry) ? root.entry : []) {
    for (const change of Array.isArray(rec(entry).changes)
      ? (rec(entry).changes as unknown[])
      : []) {
      const value = rec(rec(change).value);
      if (rec(change).field !== "messages") {
        continue;
      }
      const phoneNumberId = str(rec(value.metadata).phone_number_id) ?? "";
      const contacts = Array.isArray(value.contacts) ? (value.contacts as unknown[]) : [];
      const names = new Map(
        contacts.map((c) => [str(rec(c).wa_id) ?? "", str(rec(rec(c).profile).name) ?? null]),
      );
      for (const m of Array.isArray(value.messages) ? (value.messages as unknown[]) : []) {
        const message = rec(m);
        const parsed = oneMessage(
          message,
          phoneNumberId,
          names.get(str(message.from) ?? "") ?? null,
        );
        if (parsed) {
          out.push(parsed);
        }
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** `X-Hub-Signature-256` is the HMAC of the raw body with the app's secret. */
export function signatureOk(secret: string, raw: string, header: string | null): boolean {
  if (!header?.startsWith("sha256=")) {
    return false;
  }
  const expected = Buffer.from(createHmac("sha256", secret).update(raw, "utf8").digest("hex"));
  const given = Buffer.from(header.slice("sha256=".length));
  return expected.length === given.length && timingSafeEqual(expected, given);
}
