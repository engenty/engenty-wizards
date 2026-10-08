/**
 * Meta's WhatsApp Cloud API, the part this plugin uses: sending a message to a number, marking
 * one read, and fetching a file the person sent. The tenant's own number and token; the limits
 * of the API (how long a button may be, how many rows a list holds) are kept here.
 */

export const GRAPH = "https://graph.facebook.com/v22.0";

export interface Account {
  phoneNumberId: string;
  number: string;
  accessToken: string;
  appSecret: string | null;
  verifyToken: string;
  template: string | null;
}

/** Three buttons of twenty characters at most; a list holds ten rows of twenty-four. */
export const LIMITS = {
  buttons: 3,
  buttonTitle: 20,
  rows: 10,
  rowTitle: 24,
  rowDescription: 72,
  listButton: 20,
  body: 1024,
  text: 4096,
  caption: 1024,
  header: 60,
} as const;

export type Outgoing =
  | { type: "text"; text: string; preview?: boolean }
  | { type: "buttons"; text: string; buttons: { id: string; title: string }[]; header?: string }
  | {
      type: "list";
      text: string;
      button: string;
      rows: { id: string; title: string; description?: string }[];
      header?: string;
    }
  | { type: "image"; link: string; caption?: string }
  | { type: "document"; link: string; caption?: string; filename?: string }
  | { type: "video"; link: string; caption?: string }
  | { type: "audio"; link: string }
  | { type: "link"; text: string; url: string; label: string }
  | { type: "location_request"; text: string }
  | { type: "template"; name: string; lang: string; params: string[] };

export class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: number | null,
  ) {
    super(message);
    this.name = "GraphError";
  }
}

/** Outside the 24-hour window a free-form message is refused with this code. */
export const RE_ENGAGEMENT = 131047;

/** Cut to a length, with an ellipsis where something was cut. */
export function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function body(to: string, message: Outgoing): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to };
  switch (message.type) {
    case "text":
      return {
        ...base,
        type: "text",
        text: { body: clip(message.text, LIMITS.text), preview_url: message.preview ?? false },
      };
    case "buttons":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "button",
          ...(message.header
            ? { header: { type: "text", text: clip(message.header, LIMITS.header) } }
            : {}),
          body: { text: clip(message.text, LIMITS.body) },
          action: {
            buttons: message.buttons.slice(0, LIMITS.buttons).map((b) => ({
              type: "reply",
              reply: { id: b.id, title: clip(b.title, LIMITS.buttonTitle) },
            })),
          },
        },
      };
    case "list":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "list",
          ...(message.header
            ? { header: { type: "text", text: clip(message.header, LIMITS.header) } }
            : {}),
          body: { text: clip(message.text, LIMITS.body) },
          action: {
            button: clip(message.button, LIMITS.listButton),
            sections: [
              {
                rows: message.rows.slice(0, LIMITS.rows).map((r) => ({
                  id: r.id,
                  title: clip(r.title, LIMITS.rowTitle),
                  ...(r.description
                    ? { description: clip(r.description, LIMITS.rowDescription) }
                    : {}),
                })),
              },
            ],
          },
        },
      };
    case "image":
      return {
        ...base,
        type: "image",
        image: {
          link: message.link,
          ...(message.caption ? { caption: clip(message.caption, LIMITS.caption) } : {}),
        },
      };
    case "document":
      return {
        ...base,
        type: "document",
        document: {
          link: message.link,
          ...(message.caption ? { caption: clip(message.caption, LIMITS.caption) } : {}),
          ...(message.filename ? { filename: message.filename } : {}),
        },
      };
    case "video":
      return {
        ...base,
        type: "video",
        video: {
          link: message.link,
          ...(message.caption ? { caption: clip(message.caption, LIMITS.caption) } : {}),
        },
      };
    case "audio":
      return { ...base, type: "audio", audio: { link: message.link } };
    case "link":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "cta_url",
          body: { text: clip(message.text, LIMITS.body) },
          action: {
            name: "cta_url",
            parameters: { display_text: clip(message.label, LIMITS.buttonTitle), url: message.url },
          },
        },
      };
    case "location_request":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "location_request_message",
          body: { text: clip(message.text, LIMITS.body) },
          action: { name: "send_location" },
        },
      };
    case "template":
      return {
        ...base,
        type: "template",
        template: {
          name: message.name,
          language: { code: message.lang },
          components: message.params.length
            ? [
                {
                  type: "body",
                  parameters: message.params.map((text) => ({ type: "text", text })),
                },
              ]
            : [],
        },
      };
  }
}

export class Graph {
  constructor(
    private readonly account: Account,
    private readonly fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args),
  ) {}

  private async call(path: string, init: RequestInit): Promise<Record<string, unknown>> {
    const res = await this.fetchImpl(`${GRAPH}/${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.account.accessToken}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      parsed = {};
    }
    if (!res.ok) {
      const error = (parsed.error ?? {}) as { message?: string; code?: number };
      throw new GraphError(
        error.message ?? `WhatsApp answered ${res.status}.`,
        res.status,
        typeof error.code === "number" ? error.code : null,
      );
    }
    return parsed;
  }

  /** Sends one message; gives the message's id. */
  async send(to: string, message: Outgoing): Promise<string | null> {
    const answer = await this.call(`${this.account.phoneNumberId}/messages`, {
      method: "POST",
      body: JSON.stringify(body(to, message)),
    });
    const messages = answer.messages as { id?: string }[] | undefined;
    return messages?.[0]?.id ?? null;
  }

  /** The two ticks turn blue: the person sees their message arrived. */
  async markRead(messageId: string): Promise<void> {
    await this.call(`${this.account.phoneNumberId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      }),
    });
  }

  /** A file the person sent, by the id the webhook named: its bytes and type. */
  async media(id: string): Promise<{ data: Uint8Array; mime: string }> {
    const meta = await this.call(id, { method: "GET" });
    const url = typeof meta.url === "string" ? meta.url : null;
    if (!url) {
      throw new GraphError("The file has no address.", 404, null);
    }
    const res = await this.fetchImpl(url, {
      headers: { authorization: `Bearer ${this.account.accessToken}` },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      throw new GraphError(`The file could not be fetched (${res.status}).`, res.status, null);
    }
    const mime =
      (typeof meta.mime_type === "string" ? meta.mime_type : res.headers.get("content-type")) ??
      "application/octet-stream";
    return { data: new Uint8Array(await res.arrayBuffer()), mime: mime.split(";")[0].trim() };
  }
}
