import { streamText } from "ai";
import {
  parseWizard,
  type ValidationIssue,
  type WizardDefinition,
} from "../../shared/definition.js";
import { env } from "../env.js";
import { languageModel, tokenCostUsd } from "../models.js";
import { STARTERS } from "../starters/index.js";

export interface ArchitectInput {
  message: string;
  current: WizardDefinition | null;
  history: { role: "user" | "assistant"; content: string }[];
  mcpServers: { id: string; name: string }[];
  signal?: AbortSignal;
  onText?: (delta: string) => void;
  onBuilding?: () => void;
}

export interface ArchitectResult {
  reply: string;
  wizard: WizardDefinition | null;
  issues: ValidationIssue[];
  costUsd: number;
}

const SCHEMA_DOC = `
type Wizard = {
  version: 1
  title: string                 // short, what the end user gets ("Rechnung erstellen")
  description: string           // one sentence
  avatar: "round"|"drop"|"dome"|"flame"|"oval"|"bean"|"pebble"|"sprout"|"tower"|"wedge"  // the engenty mascot shown to end users
  intro?: string                // one friendly sentence above the first page
  steps: Step[]                 // run top to bottom; the LAST step is always a "result"
}

// Every step: { id (camelCase, unique), title, description?, next?: Branch[] }
// Branch = { when: { field, op: "equals"|"notEquals"|"in"|"notEmpty"|"empty", value? }, goto: stepId | "end" }
//   first matching branch wins, otherwise the next step in the list.

type PageStep = { type: "page", fields: Field[] (1–5 per page), cta?: string }
type Field = {
  id (camelCase, unique across the WHOLE wizard), label, kind, required?, placeholder?, help?,
  options?: string[]            // select / multiselect
  default?: string|number|boolean|string[]
  columns?: { id, label, kind: "text"|"number"|"money" }[]   // items only; row amount = product of number/money columns
  vat?: { rate?: number, field?: fieldId }                    // items only; VAT % fixed or read from a field
  currency?: "EUR"|...                                        // items only
}
// kinds: text textarea number select multiselect date email url toggle color image file items

type AgentStep = {
  type: "agent"
  instructions: string          // the task, with {{templates}}
  tools: ("web_search"|"web_fetch"|"browser"|"sandbox"|"image"|"http")[]
  mcp?: string[]                // ids of the project's MCP servers this step may use
  output: { format: "text"|"markdown"|"json", fields?: { id, kind: "text"|"number"|"list"|"table", description }[] }
  model?: "fast"|"smart"        // fast for short copy, smart for research/reasoning
  working?: string              // shown while it runs ("Recherchiert im Web …")
}

type GenerateStep = {
  type: "generate"
  asset: "image"|"video"|"document"|"dashboard"
  prompt: string                // the brief, with {{templates}}
  options?: { aspectRatio?: "1:1"|"16:9"|"9:16"|"4:5"|"3:2"|"2:3", duration?: 4–10 (video seconds), style?: string,
              template?: "invoice"|"offer"|"briefing"|"letter"|"report"|"free" }   // template for documents
  referenceImage?: fieldId      // an earlier image field the image/video starts from
  working?: string
}

type ReviewStep = { type: "review", show: stepId[], edit?: boolean, regenerate?: boolean }
// shows earlier outputs; the person accepts, edits text outputs (edit), or asks for a new version with a note (regenerate)

type ResultStep = { type: "result", message?: string, deliverables: { from: stepId, label?, formats: Format[] }[] }
// formats per source: image→png · video→mp4 · document→pdf docx html md png · dashboard→html pdf png
//                     agent text/markdown→md txt docx pdf html · agent json→json csv xlsx md

Templates (in instructions/prompt): {{fieldId}} · {{steps.stepId}} (whole output) · {{steps.stepId.key}} (json key)
  · {{itemsField}} (line items as a table WITH computed net/VAT/total) · {{itemsField.net|vat|gross}} · {{brand.name}} {{brand.details}} · {{today}}
A template may only use fields asked and steps run EARLIER.`;

const PRINCIPLES = `
How good wizards look:
- For non-technical end users. Plain words, friendly titles phrased as questions ("Wofür ist der Post?").
- Few pages, 1–5 fields each, one theme per page. Only ask what the result really needs; prefer selects with sensible defaults.
- Put a review step before anything expensive (video) and before the final result, so people can correct or regenerate.
- Money/totals: use an "items" field with vat — the runner computes totals; documents must use {{items}} verbatim. Never let a model compute totals.
- Facts from the web need an agent step with web_search + web_fetch BEFORE writing; documents then cite those notes.
- Writing into other systems (CRM, database, spreadsheet, website): an agent step with the matching mcp server, http, or browser tool, preceded by a review step.
- The sandbox runs code (python/node) for calculations, charts or file conversion; export_file hands files to the person.
- Every step a person sees later (review/result) must come from an earlier step id.
- Write all wizard texts in the admin's language.`;

function systemPrompt(mcp: { id: string; name: string }[]): string {
  const example = STARTERS.find((s) => s.id === "tweet")!.definition;
  return `You design wizards for "engenty wizards": a page-by-page flow an end user walks through, where AI steps research, write, draw images, render video, build documents and dashboards, or write into other systems.

You talk to the ADMIN who builds the wizard. Answer in the admin's language, briefly and warmly. Never mention JSON, ids, schemas or templates to them — talk about pages, questions, steps and results.

${SCHEMA_DOC}
${PRINCIPLES}

Project MCP servers available to agent steps: ${mcp.length ? mcp.map((m) => `${m.id} (${m.name})`).join(", ") : "none — if the admin wants to write into an external system that needs one, build the step with http or browser, and tell them they can connect a server in the project settings"}.

Example of a complete wizard:
\`\`\`json
${JSON.stringify(example, null, 2)}
\`\`\`

OUTPUT FORMAT — always exactly this:
1. One to three sentences to the admin: what you built or changed, and at most one useful suggestion.
2. If the wizard is new or changed: a fenced \`\`\`json block with the COMPLETE wizard (never a partial diff).
If the admin only asked a question, answer it and leave the json block out.`;
}

function extractJson(text: string): { reply: string; json: string | null } {
  const fence = text.indexOf("```");
  if (fence === -1) {
    return { reply: text.trim(), json: null };
  }
  const reply = text.slice(0, fence).trim();
  const body = text
    .slice(fence)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```[\s\S]*$/, "")
    .trim();
  return { reply, json: body };
}

async function streamOnce(
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
  input: ArchitectInput,
  forward: boolean,
): Promise<{ text: string; costUsd: number }> {
  const result = streamText({
    model: languageModel(env.models.architect),
    messages: [
      // The system prompt is long and identical on every turn: cache it.
      {
        role: "system",
        content: system,
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
      },
      ...messages,
    ],
    abortSignal: input.signal,
    maxOutputTokens: 16_000,
  });
  let text = "";
  let inFence = false;
  for await (const delta of result.textStream) {
    text += delta;
    if (!forward) {
      continue;
    }
    if (!inFence) {
      const fence = text.indexOf("```");
      if (fence === -1) {
        input.onText?.(delta);
      } else {
        inFence = true;
        const before = text.length - delta.length;
        if (fence > before) {
          input.onText?.(text.slice(before, fence));
        }
        input.onBuilding?.();
      }
    }
  }
  const usage = await result.usage;
  return { text, costUsd: tokenCostUsd(env.models.architect, usage as any) };
}

/** Turn the admin's words into a (changed) wizard. Repairs its own output once if it does not validate. */
export async function runArchitect(input: ArchitectInput): Promise<ArchitectResult> {
  const system = systemPrompt(input.mcpServers);
  const messages: { role: "user" | "assistant"; content: string }[] = [
    ...input.history.slice(-10),
    {
      role: "user",
      content: input.current
        ? `Current wizard:\n\`\`\`json\n${JSON.stringify(input.current)}\n\`\`\`\n\n${input.message}`
        : input.message,
    },
  ];
  let { text, costUsd } = await streamOnce(system, messages, input, true);
  let { reply, json } = extractJson(text);
  if (!json) {
    return { reply, wizard: null, issues: [], costUsd };
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    let parsed: ReturnType<typeof parseWizard>;
    try {
      parsed = parseWizard(JSON.parse(json));
    } catch (err) {
      parsed = { ok: false, issues: [{ message: `Invalid JSON: ${(err as Error).message}` }] };
    }
    if (parsed.ok && parsed.issues.length === 0) {
      return { reply, wizard: parsed.wizard, issues: [], costUsd };
    }
    if (attempt === 1) {
      return { reply, wizard: parsed.ok ? parsed.wizard : null, issues: parsed.issues, costUsd };
    }
    const repair = await streamOnce(
      system,
      [
        ...messages,
        { role: "assistant", content: text },
        {
          role: "user",
          content: `The wizard has these problems:\n${parsed.issues.map((i) => `- ${i.stepId ? `[${i.stepId}] ` : ""}${i.message}`).join("\n")}\nReturn the corrected COMPLETE wizard as a json block only.`,
        },
      ],
      input,
      false,
    );
    costUsd += repair.costUsd;
    text = repair.text;
    json = extractJson(repair.text).json ?? json;
  }
  return { reply, wizard: null, issues: [], costUsd };
}
