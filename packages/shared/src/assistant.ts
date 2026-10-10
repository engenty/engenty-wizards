import { z } from "zod";

/**
 * The studio's assistant between the browser and the runtime: what a page tells it, the tools
 * the browser runs, and the events of a turn. The events are our own, shaped like AG-UI's
 * (docs.ag-ui.com): message and tool-call ids and AG-UI's field names, so a later switch is a
 * rename on both ends.
 */

/** A page's snapshot is cut to this many bytes of JSON. */
export const ASSISTANT_PAGE_BYTES = 16 * 1024;

/** What the page the person writes from shows; it goes up with every message. */
export const assistantPageSchema = z.object({
  /** The studio's address: `/shop`, `/space/knowledge`. */
  route: z.string().max(400),
  /** What the top bar's trail says the page is. */
  title: z.string().max(200).optional(),
  /** The section in view: "Display and checkout". */
  view: z.string().max(200).optional(),
  /** An item the page has open. */
  open: z
    .object({
      kind: z.string().max(60),
      id: z.string().max(120).optional(),
      label: z.string().max(200),
    })
    .optional(),
  /** Ids of what the person picked. */
  selection: z.array(z.string().max(120)).max(100).optional(),
  /** A line on what the page holds: "0 products · no source · prices incl. VAT". */
  summary: z.string().max(2000).optional(),
  /** Fields of the page with their values. */
  fields: z
    .array(z.object({ id: z.string().max(120), label: z.string().max(200), value: z.unknown() }))
    .max(60)
    .optional(),
  /** The plugin whose page it is. */
  plugin: z.string().max(60).optional(),
});
export type AssistantPage = z.infer<typeof assistantPageSchema>;

/** A tool the browser runs (AG-UI's `Tool`): its arguments as JSON Schema. */
export const browserToolSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]{1,62}$/),
  description: z.string().max(2000),
  parameters: z.record(z.string(), z.unknown()),
});
export type BrowserTool = z.infer<typeof browserToolSchema>;

/** The browser waits no longer for a tool than this; the runtime neither. */
export const BROWSER_TOOL_TIMEOUT_MS = 60_000;

/** What the browser sends to start a turn (AG-UI's `RunAgentInput`, cut to what we use). */
export const assistantTurnSchema = z.object({
  message: z.string().min(1).max(8000),
  /** The space the page shows; its tools need it. */
  projectId: z.string().max(80).optional(),
  page: assistantPageSchema.optional(),
  tools: z.array(browserToolSchema).max(40).default([]),
});
export type AssistantTurn = z.input<typeof assistantTurnSchema>;

/** The events of a turn, by SSE event name. */
export interface AssistantEvents {
  /** The turn started; `messageId` is the stored message of the person. */
  run_started: { threadId: string; runId: string; messageId: string };
  text: { messageId: string; delta: string };
  /** What the assistant does right now, in a few words. */
  activity: { label: string };
  tool_call: { toolCallId: string; toolCallName: string; args: unknown };
  tool_result: { toolCallId: string; content: string };
  /** A plugin's tool returned what its card in the chat draws. */
  card: { toolCallId?: string; plugin: string; tool: string; data: unknown };
  /** The space or a plugin's data changed: the page reads its data again. */
  changed: Record<string, never>;
  done: { messageId: string; reply: string; changed: boolean };
  error: { message: string };
}

/** Where the assistant stands on the screen, per person. */
export const ASSISTANT_LAYOUTS = ["bottom", "sidebar", "avatar"] as const;
export type AssistantLayout = (typeof ASSISTANT_LAYOUTS)[number];
