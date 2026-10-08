import type { Thread, ThreadPrompt, ThreadSurface } from "@engenty-wizards/plugin-sdk/thread";
import { type Account, Graph, GraphError, LIMITS, type Outgoing, RE_ENGAGEMENT } from "./graph";

/**
 * WhatsApp as a surface of the thread door: a question with up to three short options is
 * buttons, with up to ten a list, beyond that numbered lines; a place is the "send location"
 * button; files come through the Cloud API; after a day of silence only a template goes out.
 */

export const RUNNER = "whatsapp";

/** The field kinds the thread asks itself; any other on a page hands the page to the screen. */
export const ASKS = [
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
];

const DAY = 24 * 3600_000;

/** What the door says, as a message of the Cloud API. */
export function toOutgoing(prompt: ThreadPrompt): Outgoing {
  switch (prompt.kind) {
    case "text":
      return { type: "text", text: prompt.text };
    case "choice": {
      // Of a multiple choice the picked options are left out; their ids keep their numbers.
      const options = prompt.options.filter((o) => !o.picked);
      if (
        options.length <= LIMITS.buttons &&
        options.every((o) => o.title.length <= LIMITS.buttonTitle)
      ) {
        return {
          type: "buttons",
          text: prompt.text,
          buttons: options.map((o) => ({ id: o.id, title: o.title })),
        };
      }
      if (options.length <= LIMITS.rows) {
        return {
          type: "list",
          text: prompt.text,
          button: prompt.button,
          rows: options.map((o) => ({ id: o.id, title: o.title })),
        };
      }
      return {
        type: "text",
        text: `${prompt.text}\n\n${prompt.options.map((o, i) => `${i + 1}. ${o.title}`).join("\n")}`,
      };
    }
    case "location":
      return { type: "location_request", text: prompt.text };
    case "link":
      return { type: "link", text: prompt.text, url: prompt.url, label: prompt.label };
    case "media":
      switch (prompt.media) {
        case "image":
          return { type: "image", link: prompt.url, caption: prompt.caption };
        case "document":
          return {
            type: "document",
            link: prompt.url,
            caption: prompt.caption,
            filename: prompt.filename,
          };
        case "video":
          return { type: "video", link: prompt.url, caption: prompt.caption };
        case "audio":
          return { type: "audio", link: prompt.url };
      }
  }
}

export function whatsappSurface(deps: {
  account: () => Promise<Account | null>;
  log: { warn(...args: unknown[]): void };
}): ThreadSurface {
  const graph = async () => {
    const account = await deps.account();
    if (!account) {
      throw new Error("WhatsApp is not connected.");
    }
    return new Graph(account);
  };
  return {
    runner: RUNNER,
    asks: ASKS,
    async send(thread: Thread, prompt: ThreadPrompt) {
      try {
        await (await graph()).send(thread.id, toOutgoing(prompt));
      } catch (err) {
        if (err instanceof GraphError && err.code === RE_ENGAGEMENT) {
          deps.log.warn(`thread ${thread.id}: older than a day, the message was refused`);
          return;
        }
        throw err;
      }
    },
    media: async (ref) => (await graph()).media(ref.id),
    // A free message only within a day of the person's last one.
    mayDeliver: (thread) => Date.now() - thread.lastInboundAt < DAY,
    async reach(thread, url) {
      const account = await deps.account();
      if (!account?.template) {
        return false;
      }
      await new Graph(account).send(thread.id, {
        type: "template",
        name: account.template,
        lang: thread.state.lang,
        params: [url],
      });
      return true;
    },
  };
}
