import { GOOGLE_OAUTH2, googleJson } from "../engenty/connections-google/shared.js";
import type {
  ConnectorActionContext,
  ConnectorDefinition,
} from "../engenty/connections-sdk/types.js";
import { htmlToMarkdown } from "../render/convert.js";
import {
  dayAfter,
  type MailAttachmentInfo,
  type MailBackend,
  type MailMessage,
  type MailSearchInput,
  mailActions,
  snippetOf,
} from "./mail.js";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const SCOPE_READONLY = "https://www.googleapis.com/auth/gmail.readonly";

interface GmailPayload {
  body?: { attachmentId?: string; data?: string; size?: number };
  filename?: string;
  headers?: { name: string; value: string }[];
  mimeType?: string;
  parts?: GmailPayload[];
}

interface GmailMessage {
  id: string;
  internalDate?: string;
  payload?: GmailPayload;
  snippet?: string;
}

const header = (payload: GmailPayload | undefined, name: string) =>
  payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;

function body(payload: GmailPayload | undefined, mime: string): string | null {
  if (!payload) {
    return null;
  }
  if (payload.mimeType === mime && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf8");
  }
  for (const part of payload.parts ?? []) {
    const found = body(part, mime);
    if (found) {
      return found;
    }
  }
  return null;
}

function attachments(payload: GmailPayload | undefined, out: MailAttachmentInfo[] = []) {
  if (payload?.filename && payload.body?.attachmentId) {
    out.push({
      id: payload.body.attachmentId,
      name: payload.filename,
      mime: payload.mimeType ?? "application/octet-stream",
      size: payload.body.size ?? null,
    });
  }
  for (const part of payload?.parts ?? []) {
    attachments(part, out);
  }
  return out;
}

function toMessage(raw: GmailMessage): MailMessage {
  const html = body(raw.payload, "text/html");
  const text =
    body(raw.payload, "text/plain") ?? (html ? htmlToMarkdown(html) : (raw.snippet ?? ""));
  return {
    id: raw.id,
    date: raw.internalDate ? new Date(Number(raw.internalDate)).toISOString() : null,
    from: header(raw.payload, "From"),
    to: (header(raw.payload, "To") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    subject: header(raw.payload, "Subject"),
    snippet: raw.snippet ?? snippetOf(text),
    attachments: attachments(raw.payload),
    text,
    html,
  };
}

/** Gmail's own search syntax: `{a b}` is "a OR b", dates are `after:`/`before:` days. */
function query(input: MailSearchInput): string {
  const quoted = (input.terms ?? []).map((t) => (/\s/.test(t) ? `"${t.replace(/"/g, "")}"` : t));
  return [
    quoted.length ? `{${quoted.join(" ")}}` : "",
    input.from ? `from:${input.from}` : "",
    input.since ? `after:${input.since.replace(/-/g, "/")}` : "",
    input.until ? `before:${dayAfter(input.until).replace(/-/g, "/")}` : "",
    input.has_attachment ? "has:attachment" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

const getMessage = (ctx: ConnectorActionContext, id: string) =>
  googleJson<GmailMessage>(ctx, `${GMAIL_API}/messages/${encodeURIComponent(id)}?format=full`);

const backend: MailBackend = {
  async search(input, ctx) {
    const url = new URL(`${GMAIL_API}/messages`);
    url.searchParams.set("q", query(input));
    url.searchParams.set("maxResults", String(input.limit ?? 40));
    const list = await googleJson<{ messages?: { id: string }[] }>(ctx, url.toString());
    const out: MailMessage[] = [];
    const ids = (list.messages ?? []).map((m) => m.id);
    for (let i = 0; i < ids.length; i += 10) {
      const batch = await Promise.all(ids.slice(i, i + 10).map((id) => getMessage(ctx, id)));
      out.push(...batch.map(toMessage));
    }
    return out.map(({ text: _text, html: _html, to: _to, ...summary }) => summary);
  },
  async read(id, ctx) {
    return toMessage(await getMessage(ctx, id));
  },
  async attachment(id, attachmentId, ctx) {
    const info = attachments((await getMessage(ctx, id)).payload).find(
      (a) => a.id === attachmentId,
    );
    const data = await googleJson<{ data?: string }>(
      ctx,
      `${GMAIL_API}/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`,
    );
    if (!data.data) {
      throw new Error("gmail attachment has no data");
    }
    return {
      name: info?.name ?? "attachment",
      mime: info?.mime ?? "application/octet-stream",
      data_base64: Buffer.from(data.data, "base64url").toString("base64"),
    };
  },
};

export const gmailConnector: ConnectorDefinition = {
  id: "google-gmail",
  moduleId: "wizards-mail",
  name: "Gmail",
  description: "Read mail in a Gmail or Google Workspace account.",
  icon: "logo:gmail",
  toolPrefix: "mail",
  auth: { kind: "oauth2", oauth2: GOOGLE_OAUTH2 },
  actions: mailActions(backend, [SCOPE_READONLY]),
};
