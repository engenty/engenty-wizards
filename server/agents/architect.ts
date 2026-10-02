import { streamText } from "ai";
import {
  parseWizard,
  type ValidationIssue,
  type WizardDefinition,
} from "../../shared/definition.js";
import {
  exampleWizard,
  type GuideServer,
  mcpServersLine,
  PRINCIPLES,
  SCHEMA_DOC,
} from "../authoring/guide.js";
import { env } from "../env.js";
import { languageModel, tokenCostUsd } from "../models.js";

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

function systemPrompt(mcp: GuideServer[]): string {
  return `You design wizards for "engenty wizards": a page-by-page flow an end user walks through, where AI steps research, write, draw images, render video, build documents and dashboards, or write into other systems.

You talk to the ADMIN who builds the wizard. Answer in the admin's language, briefly and warmly. Never mention JSON, ids, schemas or templates to them — talk about pages, questions, steps and results.

${SCHEMA_DOC}
${PRINCIPLES}

${mcpServersLine(mcp)}

Example of a complete wizard:
\`\`\`json
${exampleWizard()}
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
    // The system prompt is long and identical on every turn: cache it.
    instructions: {
      role: "system",
      content: system,
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
    },
    messages,
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
