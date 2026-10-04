import { anthropic } from "@ai-sdk/anthropic";
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
import { z } from "zod";
import { attachTools, costOf, gatewayTools, type ResolvedModel, textModel } from "../models.js";
import { ServiceError } from "../services/errors.js";
import {
  addProjectFile,
  projectFileContent,
  projectFiles,
  updateProjectFile,
} from "../services/project-files.js";
import { documentText } from "../services/project-index.js";
import { brandColorSchema, ownedProject, updateProject } from "../services/projects.js";
import { safeFetch } from "../tools/net-guard.js";
import { readWebsite } from "./website.js";

export interface AssistantInput {
  userId: string;
  projectId: string;
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
  signal?: AbortSignal;
  onText?: (delta: string) => void;
  /** A short line about what the assistant is doing right now. */
  onActivity?: (label: string) => void;
  /** The project changed: the page shows it. */
  onChanged?: () => void;
}

export interface AssistantResult {
  reply: string;
  changed: boolean;
  costUsd: number;
}

const MAX_STEPS = 24;

const SYSTEM = `You help the admin of "engenty wizards" set up a PROJECT: what every wizard of the project draws on — who they are (title, about), the brand (logos, colours), assets (images, graphics, videos), documents, and facts (label → value: address, VAT id, phone, opening hours — anything).

You talk to the admin. Answer in the admin's language, briefly and warmly. Never mention JSON, ids, keys or tool names.

HOW YOU WORK
- The project as it is now comes with every message. You change it ONLY through tools.
- A website: read_website it first. You get the page's text, colours from its stylesheet, logo candidates and the links to imprint / contact / about. Read those pages too (at most four more) for address, VAT id, register number, phone, email, bank details, who runs it.
- Facts: one fact per thing, a short label in the admin's language ("Adresse", "UID", "Telefon"), the value on one line where it fits. Only what a source or the admin states — never guess, never invent. Keep the facts that are there; a fact with a known label is updated.
- About: two to five sentences — what they do, for whom, what sets them apart, the tone they write in. Rewrite it only when you learned something new or the admin asks.
- Colours: two to six, the main one first, each with a name that says what it is for ("Primär", "Hintergrund", "Text"). Take them from the stylesheet's variables or its most used colours, never from photos. set_colors replaces the list: pass all colours that should remain.
- Logos: save the best candidate (an SVG or a large PNG rather than a favicon); a second one only if it truly differs (for dark ground, a signet). A few images that show the business (header, team, products) may be saved as assets — a handful, never everything.
- Files the admin attached are stored already; the message names them. look_at_file shows you a picture or a document's text. Give a file a description with describe_file when it has none or the admin says what it is. Take facts from a document when the admin asks for it.
- Call independent tools together. Work in few steps.
- Finish with one to three sentences: what you filled in, what is still missing, and at most one question.`;

function activity(tool: string, args: Record<string, unknown>): string | null {
  const host = (u: unknown) => {
    try {
      return new URL(/^https?:/i.test(String(u)) ? String(u) : `https://${u}`).hostname;
    } catch {
      return "";
    }
  };
  switch (tool) {
    case "read_website":
      return args.url ? `Liest ${host(args.url)} …` : "Liest die Website …";
    case "save_file":
      return args.kind === "logo" ? "Holt das Logo …" : "Holt eine Datei …";
    case "set_profile":
      return "Schreibt Titel und Beschreibung …";
    case "set_facts":
    case "remove_facts":
      return "Trägt Fakten ein …";
    case "set_colors":
      return "Trägt die Farben ein …";
    case "look_at_file":
      return "Sieht sich eine Datei an …";
    case "describe_file":
      return "Beschreibt eine Datei …";
    default:
      return null;
  }
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
  return {
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

function buildTools(input: AssistantInput, resolved: ResolvedModel<unknown>, wrote: () => void) {
  const { userId, projectId, signal } = input;
  // Said from inside the tool: an installed AI client runs tools without the stream showing it.
  const doing = (tool: string, args: Record<string, unknown> = {}) => {
    const label = activity(tool, args);
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
  if (resolved.vendor === "anthropic") {
    tools.web_search = anthropic.tools.webSearch_20250305({ maxUses: 5 });
  } else if (resolved.gateway) {
    tools.web_search = gatewayTools.perplexitySearch({ maxResults: 6 });
  }
  return tools;
}

/** One turn with the project assistant: it reads what the admin gave and fills the project in. */
export async function runProjectAssistant(input: AssistantInput): Promise<AssistantResult> {
  let changed = false;
  const resolved = await textModel("high");
  const tools = buildTools(input, resolved, () => {
    changed = true;
    input.onChanged?.();
  });
  attachTools(resolved, tools);
  const agent = new Agent({
    id: "project-assistant",
    name: "Project assistant",
    instructions: {
      role: "system",
      content: SYSTEM,
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    },
    model: resolved.model as unknown as MastraModelConfig,
    tools,
  });
  const context = [
    `The project now:\n\`\`\`json\n${JSON.stringify(await projectState(input.userId, input.projectId))}\n\`\`\``,
    input.message,
  ].join("\n\n");
  const stream = await agent.stream(
    [
      ...input.history
        .slice(-12)
        .map((m) =>
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
        input.onActivity?.("Sucht im Web …");
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
  return { reply: reply.trim(), changed, costUsd: costOf(resolved, usage) };
}
