import type {
  ConnectorActionContext,
  ConnectorDefinition,
} from "../engenty/connections-sdk/types.js";
import {
  bodyToText,
  graphJson,
  MICROSOFT_OAUTH2,
} from "../engenty/connections-microsoft/graph.js";
import {
  type MailAttachmentInfo,
  type MailBackend,
  type MailMessage,
  type MailSearchInput,
  mailActions,
  snippetOf,
} from "./mail.js";

const SCOPE_READ = "Mail.Read";

interface GraphAddress {
  emailAddress?: { address?: string; name?: string };
}

interface GraphMessage {
  id: string;
  subject?: string | null;
  bodyPreview?: string | null;
  receivedDateTime?: string | null;
  hasAttachments?: boolean;
  from?: GraphAddress | null;
  toRecipients?: GraphAddress[];
  body?: { content?: string | null; contentType?: string | null };
}

interface GraphAttachment {
  "@odata.type"?: string;
  id: string;
  name?: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
  contentBytes?: string;
}

const address = (a: GraphAddress | null | undefined) => {
  const e = a?.emailAddress;
  return e?.address ? (e.name ? `${e.name} <${e.address}>` : e.address) : null;
};

/** KQL, the language of Graph's `$search` on messages. */
function kql(input: MailSearchInput): string {
  const quote = (t: string) => `"${t.replace(/["\\]/g, "")}"`;
  const parts = [
    input.terms?.length ? `(${input.terms.map(quote).join(" OR ")})` : "",
    input.from ? `from:${quote(input.from)}` : "",
    input.since || input.until
      ? `received:${input.since ?? "1990-01-01"}..${input.until ?? "2999-12-31"}`
      : "",
    input.has_attachment ? "hasAttachments:true" : "",
  ].filter(Boolean);
  return parts.join(" AND ");
}

async function attachmentsOf(ctx: ConnectorActionContext, id: string): Promise<MailAttachmentInfo[]> {
  const data = await graphJson<{ value?: GraphAttachment[] }>(
    ctx,
    `/me/messages/${encodeURIComponent(id)}/attachments?$select=id,name,contentType,size,isInline`,
  );
  return (data.value ?? [])
    .filter((a) => !a.isInline)
    .map((a) => ({
      id: a.id,
      name: a.name ?? "attachment",
      mime: a.contentType ?? "application/octet-stream",
      size: a.size ?? null,
    }));
}

const SELECT = "id,subject,bodyPreview,receivedDateTime,hasAttachments,from";

const backend: MailBackend = {
  async search(input, ctx) {
    const params = new URLSearchParams({ $select: SELECT, $top: String(input.limit ?? 40) });
    const search = kql(input);
    if (search) {
      params.set("$search", `"${search.replace(/"/g, '\\"')}"`);
    } else {
      params.set("$orderby", "receivedDateTime desc");
    }
    const data = await graphJson<{ value?: GraphMessage[] }>(ctx, `/me/messages?${params}`);
    const messages = data.value ?? [];
    return Promise.all(
      messages.map(async (m) => ({
        id: m.id,
        date: m.receivedDateTime ?? null,
        from: address(m.from),
        subject: m.subject ?? null,
        snippet: snippetOf(m.bodyPreview ?? ""),
        attachments: m.hasAttachments ? await attachmentsOf(ctx, m.id) : [],
      })),
    );
  },
  async read(id, ctx): Promise<MailMessage> {
    const m = await graphJson<GraphMessage>(
      ctx,
      `/me/messages/${encodeURIComponent(id)}?$select=${SELECT},toRecipients,body`,
    );
    const text = bodyToText(m.body);
    return {
      id: m.id,
      date: m.receivedDateTime ?? null,
      from: address(m.from),
      to: (m.toRecipients ?? []).map(address).filter((a): a is string => Boolean(a)),
      subject: m.subject ?? null,
      snippet: snippetOf(m.bodyPreview ?? text),
      attachments: m.hasAttachments ? await attachmentsOf(ctx, m.id) : [],
      text,
      html: m.body?.contentType?.toLowerCase() === "html" ? (m.body.content ?? null) : null,
    };
  },
  async attachment(id, attachmentId, ctx) {
    const a = await graphJson<GraphAttachment>(
      ctx,
      `/me/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`,
    );
    if (!a.contentBytes) {
      throw new Error("This attachment is not a file.");
    }
    return {
      name: a.name ?? "attachment",
      mime: a.contentType ?? "application/octet-stream",
      data_base64: a.contentBytes,
    };
  },
};

export const outlookConnector: ConnectorDefinition = {
  id: "microsoft-outlook",
  moduleId: "wizards-mail",
  name: "Outlook",
  description: "Read mail in an Outlook or Microsoft 365 account.",
  icon: "logo:outlook",
  toolPrefix: "mail",
  auth: { kind: "oauth2", oauth2: MICROSOFT_OAUTH2 },
  actions: mailActions(backend, [SCOPE_READ]),
};
