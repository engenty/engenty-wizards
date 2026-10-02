import { STARTERS } from "../starters/index.js";

/**
 * How a wizard is written down and what makes a good one. The studio's architect and the MCP
 * tools hand the same text to whichever model authors the wizard.
 */
export const SCHEMA_DOC = `
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

export const PRINCIPLES = `
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

export interface GuideServer {
  id: string;
  name: string;
}

export function mcpServersLine(mcp: GuideServer[]): string {
  return `Project MCP servers available to agent steps: ${mcp.length ? mcp.map((m) => `${m.id} (${m.name})`).join(", ") : "none — if the admin wants to write into an external system that needs one, build the step with http or browser, and tell them they can connect a server in the project settings"}.`;
}

export function exampleWizard(): string {
  return JSON.stringify(STARTERS.find((s) => s.id === "tweet")!.definition, null, 2);
}

/** The guide an MCP client reads before it writes a wizard. */
export function authoringGuide(mcp: GuideServer[]): string {
  return `engenty wizards: a wizard is a page-by-page flow an end user walks through on a shared link. Pages ask questions; AI steps research, write, draw images, render video, build documents and dashboards, or write into other systems. You author the wizard as JSON; the person who asked you is the ADMIN, the people who later open the link are END USERS.

${SCHEMA_DOC}
${PRINCIPLES}

${mcpServersLine(mcp)}

Models: an agent step's "model" is "fast" (short copy, cheap) or "smart" (research, reasoning). Image, video and document models are chosen by the platform.

Editing:
- Every write returns the new "revision" and the validator's "issues". Pass the revision you last saw as "baseRevision"; on revision_conflict re-read with get_wizard and apply your change again.
- Prefer edit_wizard with small ops; use replace_wizard only to rewrite most of the wizard.
- A draft may have issues while you work. publish_wizard and start_test_run refuse until there are none.
- Put a short "note" on writes (what changed, in the admin's language) — the admin sees it in the studio.
- Test runs and published runs spend the admin's credits (research ~150, video ~250, short copy with an image ~15).

Example of a complete wizard:
\`\`\`json
${exampleWizard()}
\`\`\``;
}
