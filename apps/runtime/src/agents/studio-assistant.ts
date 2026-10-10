import { anthropic } from "@ai-sdk/anthropic";
import type { AssistantPage, BrowserTool } from "@engenty-wizards/shared/assistant";
import {
  FACT_TYPES,
  factKey,
  PROJECT_FILE_KINDS,
  PROJECT_LIMITS,
  projectFileLimit,
} from "@engenty-wizards/shared/projects";
import { Agent } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import { createTool } from "@mastra/core/tools";
import { nanoid } from "nanoid";
import { z } from "zod";
import { knowsTools } from "../assistant/knows.js";
import { PRIMER } from "../assistant/primer.js";
import type { SessionUser } from "../auth/index.js";
import type { AssistantCardRecord, AssistantToolCallRecord } from "../db/schema.js";
import { attachTools, costOf, gatewayTools, textModel } from "../models.js";
import type { ChatRow, TurnHistory } from "../services/assistant-chats.js";
import { ServiceError } from "../services/errors.js";
import { knowledgeCounts } from "../services/knowledge.js";
import {
  addProjectFile,
  projectFileContent,
  projectFiles,
  updateProjectFile,
} from "../services/project-files.js";
import { documentText } from "../services/project-index.js";
import {
  brandColorSchema,
  ownedProject,
  type ProjectRow,
  updateProject,
} from "../services/projects.js";
import { categoryRows } from "../services/space-categories.js";
import { currentTenant } from "../tenants/tenant.js";
import { safeFetch } from "../tools/net-guard.js";
import { assistantPageOf, assistantToolsOf } from "../tools/plugin.js";
import { readWebsite } from "./website.js";

export interface AssistantInput {
  user: SessionUser;
  /** The open chat: its earlier messages, running summary and the last chats' summaries. */
  chat: ChatRow;
  history: TurnHistory;
  /** The space the studio shows; null where it has none. */
  project: ProjectRow | null;
  /** The space may be changed: its tools and the plugins' tools are there. */
  writable: boolean;
  message: string;
  /** What the page the person writes from shows. */
  page: AssistantPage | null;
  /** Tools the browser runs (AG-UI's `tools`): the built-in six and what the page adds. */
  browserTools: BrowserTool[];
  lang: "de" | "en";
  signal?: AbortSignal;
  onText?: (delta: string) => void;
  /** A short line about what the assistant is doing right now. */
  onActivity?: (label: string) => void;
  /** The space or a plugin's data changed: the page shows it. */
  onChanged?: () => void;
  /** A plugin's tool returned what its card in the chat draws. */
  onCard?: (card: AssistantCardRecord) => void;
  onToolCall?: (call: { toolCallId: string; toolCallName: string; args: unknown }) => void;
  onToolResult?: (result: { toolCallId: string; content: string }) => void;
  /** Runs a browser tool: sent on the open stream, its result awaited. */
  callBrowser: (call: {
    toolCallId: string;
    toolCallName: string;
    args: unknown;
  }) => Promise<unknown>;
}

export interface AssistantResult {
  reply: string;
  changed: boolean;
  cards: AssistantCardRecord[];
  toolCalls: AssistantToolCallRecord[];
  costUsd: number;
}

const MAX_STEPS = 24;

const SYSTEM = `You are the assistant of the engenty wizards studio. You stand on every page of the studio except the wizard editor, which has a chat of its own: the space's pages, the settings, the plugins' pages. You help the person who works here understand the app, set it up and find their way.

You talk to the person. Answer in their language, briefly and warmly: a few sentences, a short list where it helps. Never mention JSON, ids, keys or tool names. Call it a space (German „Space“), never a project: the tools say project, the app says space.

${PRIMER}

WHAT YOU KNOW
- How the app works: from the guides of this installed version. Before you explain how something works, docs_search (and docs_read a page); link the page you used (engenty.ai/docs/…). How wizards are written: authoring_guide. Never guess at a menu, a button or a feature.
- Live data only from tools, never from memory: gallery_search / gallery_detail for templates, plans for plans and prices, account for the person, team, plan and credits, usage for what was spent, wizards and runs for the space, models for what thinks and makes here.
- You never buy, upgrade, top up or change a plan or a setting that costs money. Explain it, then open the page where the person does it (navigate, or give the billing page's link).
- Earlier chats: their summaries come with every message. chats_search and chat_read find more when the person refers to something said before.

THE PAGE
- Every message comes with the page the person writes from: its address, title, the section in view, an open item, what is selected, a line on what it holds and its fields. Answer about what they see; "this" and "here" mean that page.
- In the browser you may: navigate (open a studio page), highlight (dim the page except one element, or ring it, with a short card), look_at_page (what is visible: headings, buttons, fields with their values), read_section (one area in full), fill_field (put a value into a field, not saved), scroll_to. A page may add tools of its own. Targets are what look_at_page lists.
- Show rather than describe: open the page and highlight the place when the person asks where or how. look_at_page first when you are not sure what is there.
- fill_field never saves: say that the person checks and saves. You never press buttons for the person.

THE SPACE
- Where a space's tools are there, you also fill the space in: what every wizard of the space draws on — who they are (title, about), the brand (logos, colours), assets (images, graphics, videos), documents, and facts (label → value: address, VAT id, phone, opening hours — anything). The space as it is now comes with every message then; you change it ONLY through tools.
- A website: read_website it first. You get the page's text, colours from its stylesheet, logo candidates and the links to imprint / contact / about. Read those pages too (at most four more) for address, VAT id, register number, phone, email, bank details, who runs it.
- Facts: one fact per thing, a short label in the person's language ("Adresse", "UID", "Telefon"), the value on one line where it fits. Only what a source or the person states — never guess, never invent. Keep the facts that are there; a fact with a known label is updated.
- About: two to five sentences — what they do, for whom, what sets them apart, the tone they write in. Rewrite it only when you learned something new or the person asks.
- Colours: two to six, the main one first, each with a name that says what it is for ("Primär", "Hintergrund", "Text"). Take them from the stylesheet's variables or its most used colours, never from photos. set_colors replaces the list: pass all colours that should remain.
- Logos: save the best candidate (an SVG or a large PNG rather than a favicon); a second one only if it truly differs (for dark ground, a signet). A few images that show the business (header, team, products) may be saved as assets — a handful, never everything.
- Files the person attached are stored already; the message names them. look_at_file shows you a picture or a document's text. Give a file a description with describe_file when it has none or the person says what it is. Take facts from a document when asked.
- Wissen (German „Wissen“) is what the wizards' steps look things up in: pages, tables and files, kept apart by typed Kategorien. Documents the person attaches are read into Wissen by themselves: say so; do not copy their text into facts unless asked. A website, a sitemap or a folder whose entries should go into Wissen is a source: where a tool proposes sources, use it (the person takes the proposal on its card); where there is none, say that sources need the Sources plugin.
- Talking from another page than Info & brand, change title, about, logos, colours and facts only when the person asks.
- A space that is read-only (synced from a local install, or a team that builds elsewhere) has no tools: say where it is changed.

HOW YOU WORK
- Call independent tools together. Work in few steps.
- Finish with one to three sentences: what you did or found, what is still open, and at most one question.`;

const LABELS: Record<string, { de: string; en: string }> = {
  save_logo: { de: "Holt das Logo …", en: "Fetching the logo …" },
  save_file: { de: "Holt eine Datei …", en: "Fetching a file …" },
  set_profile: { de: "Schreibt Titel und Beschreibung …", en: "Writing title and description …" },
  set_facts: { de: "Trägt Fakten ein …", en: "Entering facts …" },
  set_colors: { de: "Trägt die Farben ein …", en: "Entering the colours …" },
  look_at_file: { de: "Sieht sich eine Datei an …", en: "Looking at a file …" },
  describe_file: { de: "Beschreibt eine Datei …", en: "Describing a file …" },
  web_search: { de: "Sucht im Web …", en: "Searching the web …" },
};

function activity(tool: string, args: Record<string, unknown>, lang: "de" | "en"): string | null {
  const host = (u: unknown) => {
    try {
      return new URL(/^https?:/i.test(String(u)) ? String(u) : `https://${u}`).hostname;
    } catch {
      return "";
    }
  };
  if (tool === "read_website") {
    const at = args.url ? host(args.url) : "";
    return lang === "de"
      ? at
        ? `Liest ${at} …`
        : "Liest die Website …"
      : at
        ? `Reading ${at} …`
        : "Reading the website …";
  }
  const key =
    tool === "save_file" && args.kind === "logo"
      ? "save_logo"
      : tool === "remove_facts"
        ? "set_facts"
        : tool;
  return LABELS[key]?.[lang] ?? null;
}

async function attempt<T>(run: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await run();
  } catch (err) {
    return { error: err instanceof ServiceError ? err.message : (err as Error).message };
  }
}

async function projectState(userId: string, projectId: string) {
  const p = await ownedProject(userId, projectId);
  const files = await projectFiles(projectId);
  const categories = await categoryRows(projectId);
  return {
    wissen: {
      ...(await knowledgeCounts(projectId)),
      kategorien: categories.map((c) => `${c.name} (${c.type}${c.proposed ? ", proposed" : ""})`),
    },
    title: p.brand.name ?? "",
    about: p.brand.about ?? "",
    colors: p.brand.colors ?? [],
    facts: p.facts.map(({ label, value }) => ({ label, value })),
    files: files.map((f) => ({
      id: f.id,
      kind: f.kind,
      name: f.name,
      description: f.description,
      ...(f.status === "ready" ? {} : { status: f.status }),
    })),
  };
}

/** The space's own tools: what fills it in. */
function spaceTools(input: AssistantInput, project: ProjectRow, wrote: () => void) {
  const { signal } = input;
  const userId = input.user.id;
  const projectId = project.id;
  // Said from inside the tool: an installed AI client runs tools without the stream showing it.
  const doing = (tool: string, args: Record<string, unknown> = {}) => {
    const label = activity(tool, args, input.lang);
    if (label) {
      input.onActivity?.(label);
    }
  };
  // Tools of one step run together; writes to the project's row take turns.
  let turn: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(run: () => Promise<T>): Promise<T> => {
    const next = turn.then(run, run);
    turn = next.catch(() => undefined);
    return next;
  };
  const tools: Record<string, any> = {
    read_website: createTool({
      id: "read_website",
      description:
        "Read a public web page: its text as Markdown, the colours of its stylesheet (named variables and the most used ones), logo candidates and images with their addresses, and the links to imprint, contact and about pages.",
      inputSchema: z.object({ url: z.string().describe("The page's address") }),
      execute: ({ url }) => {
        doing("read_website", { url });
        return attempt(() => readWebsite(url, signal));
      },
    }),
    set_profile: createTool({
      id: "set_profile",
      description:
        "Set the project's title (the company, brand or undertaking) and/or its about text.",
      inputSchema: z.object({
        title: z.string().max(120).optional(),
        about: z.string().max(8000).optional(),
      }),
      execute: ({ title, about }) =>
        attempt(() =>
          inTurn(async () => {
            doing("set_profile");
            await updateProject(userId, projectId, {
              brand: {
                ...(title !== undefined ? { name: title } : {}),
                ...(about !== undefined ? { about } : {}),
              },
            });
            wrote();
            return { ok: true };
          }),
        ),
    }),
    set_facts: createTool({
      id: "set_facts",
      description:
        "Add facts to the project, or update the ones whose label is already there. A fact is a label and a value.",
      inputSchema: z.object({
        facts: z
          .array(
            z.object({
              label: z.string().min(1).max(80),
              value: z.string().min(1).max(4000),
              type: z.enum(FACT_TYPES).optional().describe("Only when the value's look misleads"),
            }),
          )
          .min(1),
      }),
      execute: ({ facts }) =>
        attempt(() =>
          inTurn(async () => {
            doing("set_facts");
            const p = await ownedProject(userId, projectId);
            const next = [...p.facts];
            for (const f of facts) {
              const label = f.label.trim();
              const at = next.findIndex((x) => x.label.toLowerCase() === label.toLowerCase());
              if (at >= 0) {
                next[at] = { ...next[at], value: f.value.trim(), type: f.type ?? next[at].type };
              } else {
                const key = factKey(
                  label,
                  next.map((x) => x.key),
                );
                next.push({
                  key,
                  label,
                  value: f.value.trim(),
                  ...(f.type ? { type: f.type } : {}),
                });
              }
            }
            if (next.length > PROJECT_LIMITS.facts) {
              throw new Error(`A project holds at most ${PROJECT_LIMITS.facts} facts.`);
            }
            await updateProject(userId, projectId, { facts: next });
            wrote();
            return { ok: true, facts: next.length };
          }),
        ),
    }),
    remove_facts: createTool({
      id: "remove_facts",
      description: "Remove facts by their labels. Only when the admin asks or a fact is wrong.",
      inputSchema: z.object({ labels: z.array(z.string()).min(1) }),
      execute: ({ labels }) =>
        attempt(() =>
          inTurn(async () => {
            doing("remove_facts");
            const p = await ownedProject(userId, projectId);
            const gone = new Set(labels.map((l) => l.trim().toLowerCase()));
            const next = p.facts.filter((f) => !gone.has(f.label.toLowerCase()));
            await updateProject(userId, projectId, { facts: next });
            wrote();
            return { ok: true, removed: p.facts.length - next.length };
          }),
        ),
    }),
    set_colors: createTool({
      id: "set_colors",
      description:
        "Set the brand's colours — the whole list, the main colour first. Values as #rrggbb.",
      inputSchema: z.object({ colors: z.array(brandColorSchema).max(PROJECT_LIMITS.colors) }),
      execute: ({ colors }) =>
        attempt(() =>
          inTurn(async () => {
            doing("set_colors");
            await updateProject(userId, projectId, {
              brand: { colors: colors.map((c) => ({ ...c, value: c.value.toLowerCase() })) },
            });
            wrote();
            return { ok: true };
          }),
        ),
    }),
    save_file: createTool({
      id: "save_file",
      description:
        "Fetch a file from a public address into the project: a logo, an asset (image, graphic, video) or a document (PDF, Word, Excel, CSV, text). Documents are read and indexed afterwards.",
      inputSchema: z.object({
        url: z.string(),
        kind: z.enum(PROJECT_FILE_KINDS),
        description: z
          .string()
          .max(600)
          .optional()
          .describe("One sentence: what it shows or holds, and what it suits"),
      }),
      execute: ({ url, kind, description }) =>
        attempt(async () => {
          doing("save_file", { kind });
          const res = await safeFetch(url, {
            headers: { "user-agent": "Mozilla/5.0 (compatible; engenty-wizards/0.1)" },
            signal: AbortSignal.any([AbortSignal.timeout(60_000), ...(signal ? [signal] : [])]),
          });
          if (!res.ok) {
            throw new Error(`The address answered ${res.status}.`);
          }
          const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
          if (Number(res.headers.get("content-length") ?? 0) > projectFileLimit(kind, mime)) {
            throw new Error("The file is too large.");
          }
          const data = new Uint8Array(await res.arrayBuffer());
          const name = decodeURIComponent(new URL(res.url).pathname.split("/").pop() || kind);
          const row = await addProjectFile(projectId, {
            kind,
            name,
            mime: mime === "text/html" && kind !== "document" ? "" : mime,
            data,
            description,
            source: res.url,
          });
          wrote();
          return { ok: true, id: row.id, name: row.name, mime: row.mime, size: row.size };
        }),
    }),
    describe_file: createTool({
      id: "describe_file",
      description: "Set the description of one of the project's files.",
      inputSchema: z.object({ id: z.string(), description: z.string().max(600) }),
      execute: ({ id, description }) =>
        attempt(async () => {
          doing("describe_file");
          await updateProjectFile(projectId, id, { description });
          wrote();
          return { ok: true };
        }),
    }),
    look_at_file: createTool({
      id: "look_at_file",
      description:
        "Look at one of the project's files: a picture is shown to you, a document comes as text.",
      inputSchema: z.object({
        id: z.string(),
        from: z.number().int().min(0).optional().describe("Documents: character to start at"),
      }),
      execute: ({ id, from }) =>
        attempt(async () => {
          doing("look_at_file");
          const { row, data } = await projectFileContent(projectId, id);
          if (row.kind === "document") {
            const text = await documentText(row);
            if (!text) {
              return { name: row.name, note: `The document is not read yet (${row.status}).` };
            }
            const start = Math.min(from ?? 0, text.length);
            return {
              name: row.name,
              text: text.slice(start, start + 12_000),
              next: start + 12_000 < text.length ? start + 12_000 : null,
            };
          }
          if (!/^image\/(png|jpeg|webp|gif)$/.test(row.mime) || data.byteLength > 5_000_000) {
            return { name: row.name, mime: row.mime, note: "This file cannot be shown to you." };
          }
          return { name: row.name, image: data.toString("base64"), mime: row.mime };
        }),
      toModelOutput: (out: any) => {
        if (!out?.image) {
          return { type: "json", value: out };
        }
        return {
          type: "content",
          value: [
            { type: "text", text: out.name },
            { type: "image-data", data: out.image, mediaType: out.mime },
          ],
        };
      },
    }),
  };
  return tools;
}

/** A browser tool as the model calls it: sent to the page, its answer awaited. */
function browserTool(input: AssistantInput, spec: BrowserTool) {
  let inputSchema: z.ZodType;
  try {
    inputSchema = z.fromJSONSchema(spec.parameters as Parameters<typeof z.fromJSONSchema>[0]);
  } catch {
    return null;
  }
  return createTool({
    id: spec.name,
    description: spec.description,
    inputSchema,
    // The id is the one `traced` gave the call: the browser answers to it.
    execute: async (args: unknown, ctx?: { toolCallId?: string }) =>
      input.callBrowser({
        toolCallId: ctx?.toolCallId ?? nanoid(10),
        toolCallName: spec.name,
        args,
      }),
  } as never);
}

/** Text of a tool's result for the chat's record, cut short. */
function resultText(out: unknown): string {
  if (typeof out === "string") {
    return out.slice(0, 1200);
  }
  try {
    return (
      JSON.stringify(out, (key, value) => (key === "image" ? "(picture)" : value))?.slice(
        0,
        1200,
      ) ?? ""
    );
  } catch {
    return "";
  }
}

/**
 * Every tool says when it is called and what it gave back (AG-UI's tool call), from inside: an
 * installed AI client runs tools without the stream showing it. A browser tool's call carries the
 * same id to the page.
 */
function traced(
  tools: Record<string, any>,
  input: AssistantInput,
  record: AssistantToolCallRecord[],
) {
  for (const [name, tool] of Object.entries(tools)) {
    const run = tool?.execute;
    if (typeof run !== "function") {
      continue;
    }
    tool.execute = async (args: unknown, ctx: Record<string, unknown> = {}) => {
      const toolCallId = nanoid(10);
      const call = { toolCallId, toolCallName: name, args };
      input.onToolCall?.(call);
      const out = await run(args, { ...ctx, toolCallId });
      const content = resultText(out);
      record.push({ ...call, result: content });
      input.onToolResult?.({ toolCallId, content });
      return out;
    };
  }
}

/** The part of the space page a route stands on. */
function partOf(route: string): string | null {
  const m = route.match(/^\/space\/(info|knowledge|data|results)/);
  return m ? m[1] : route === "/space" ? "info" : null;
}

/** One turn of the studio assistant. */
export async function runStudioAssistant(input: AssistantInput): Promise<AssistantResult> {
  let changed = false;
  const resolved = await textModel("high");
  const wrote = () => {
    changed = true;
    input.onChanged?.();
  };
  const cards: AssistantCardRecord[] = [];
  const { project } = input;
  const space = project && input.writable ? project : null;
  const tools: Record<string, any> = {
    ...knowsTools({
      user: input.user,
      project: project
        ? { id: project.id, name: project.name, mcpServers: project.mcpServers }
        : null,
      lang: input.lang,
      chatId: input.chat.id,
      doing: (label) => input.onActivity?.(label),
    }),
    ...(space ? spaceTools(input, space, wrote) : {}),
  };
  // What the tenant's plugins let the assistant do besides: a source of knowledge, say.
  if (space) {
    Object.assign(
      tools,
      await assistantToolsOf({
        tenantId: currentTenant(),
        space: { id: space.id, name: space.name },
        userId: input.user.id,
        signal: input.signal ?? new AbortController().signal,
        emit: (message) => input.onActivity?.(message),
        changed: wrote,
        card: (card) => {
          cards.push(card);
          input.onCard?.(card);
        },
      }),
    );
  }
  for (const spec of input.browserTools) {
    if (tools[spec.name]) {
      continue;
    }
    const tool = browserTool(input, spec);
    if (tool) {
      tools[spec.name] = tool;
    }
  }
  const toolCalls: AssistantToolCallRecord[] = [];
  traced(tools, input, toolCalls);
  if (resolved.vendor === "anthropic") {
    tools.web_search = anthropic.tools.webSearch_20250305({ maxUses: 5 });
  } else if (resolved.gateway) {
    tools.web_search = gatewayTools.perplexitySearch({ maxResults: 6 });
  }
  attachTools(resolved, tools);
  const agent = new Agent({
    id: "studio-assistant",
    name: "Studio assistant",
    instructions: {
      role: "system",
      content: SYSTEM,
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    },
    model: resolved.model as unknown as MastraModelConfig,
    tools,
  });
  const page = input.page;
  const pluginPage =
    page?.plugin && project
      ? await assistantPageOf(currentTenant(), page.plugin, { id: project.id, name: project.name })
      : null;
  const part = page ? partOf(page.route) : null;
  const { history } = input;
  const context = [
    history.earlier.length
      ? `Earlier chats with this person, newest first (chats_search finds more):\n${history.earlier
          .map(
            (c) => `- ${c.closedAt.slice(0, 10)} "${c.title}": ${c.summary.replace(/\n+/g, " ")}`,
          )
          .join("\n")}`
      : "",
    history.running ? `What this chat said before the messages above:\n${history.running}` : "",
    page
      ? `Current page:\n\`\`\`json\n${JSON.stringify(page)}\n\`\`\``
      : "The person writes from a page that tells nothing about itself.",
    pluginPage
      ? [
          `The page is the plugin "${pluginPage.name}"'s${pluginPage.description ? `: ${pluginPage.description}` : "."} They most likely mean what that page holds: use its tools first (their names begin with "${page?.plugin?.replace(/-/g, "_")}_"). Space settings stay possible when they ask for them.`,
          ...pluginPage.blocks,
        ].join("\n\n")
      : "",
    space
      ? `The space now:\n\`\`\`json\n${JSON.stringify(await projectState(input.user.id, space.id))}\n\`\`\``
      : project
        ? `The space "${project.name}" is read-only here: nothing of it can be changed in this studio.`
        : "No space is open.",
    part === "knowledge"
      ? "The person talks to you from Wissen: they want the wizards to know something."
      : "",
    input.message,
  ]
    .filter(Boolean)
    .join("\n\n");
  const stream = await agent.stream(
    [
      ...history.messages.map((m) =>
        m.role === "user"
          ? { role: "user" as const, content: m.content }
          : { role: "assistant" as const, content: m.content },
      ),
      { role: "user" as const, content: context },
    ],
    {
      maxSteps: MAX_STEPS,
      abortSignal: input.signal,
      modelSettings: { maxOutputTokens: 8000 },
    },
  );
  let reply = "";
  for await (const chunk of stream.fullStream as AsyncIterable<any>) {
    const payload = chunk.payload ?? chunk;
    if (chunk.type === "text-delta") {
      const text: string = payload.text ?? payload.delta ?? "";
      reply += text;
      input.onText?.(text);
    } else if (chunk.type === "tool-call") {
      // The model's own search has no tool of ours that could say so.
      if (payload.toolName === "web_search") {
        input.onActivity?.(LABELS.web_search[input.lang]);
      }
      // Keep what it says before and after a tool call apart.
      if (reply.trim() && !reply.endsWith("\n\n")) {
        input.onText?.("\n\n");
        reply += "\n\n";
      }
    } else if (chunk.type === "error") {
      throw payload.error ?? new Error("assistant stream error");
    }
  }
  const usage: any = (await (stream as any).totalUsage) ?? (await stream.usage);
  return { reply: reply.trim(), changed, cards, toolCalls, costUsd: costOf(resolved, usage) };
}
