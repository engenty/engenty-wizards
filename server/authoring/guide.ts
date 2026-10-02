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
  output: { format: "text"|"markdown"|"json", fields?: { id, kind: "text"|"number"|"list"|"table", description, columns?: string[] }[] }
                                // a table with columns gives rows as objects with exactly those keys — what widgets read
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

type WidgetStep = {
  type: "widget"
  entry: string                 // workspace path of the widget's HTML, e.g. "weather/index.html"
  data: { [key]: string }       // what the widget gets as wizard.data: key → fieldId | steps.stepId | steps.stepId.key | brand.name | today
  sample?: string               // workspace path of example data (same shape as data) for previews
  size?: { width, height }      // design size in px, default 1280×720 (9:16 → 1080×1920)
  working?: string
}
// an interactive HTML app written ONCE into the workspace; every run only brings new data (no model call, no cost)

type ReviewStep = { type: "review", show: stepId[], edit?: boolean, regenerate?: boolean }
// shows earlier outputs; the person accepts, edits text outputs (edit), or asks for a new version with a note (regenerate)

type ResultStep = { type: "result", message?: string, deliverables: { from: stepId, label?, formats: Format[] }[] }
// formats per source: image→png · video→mp4 · document→pdf docx html md png · dashboard→html pdf png
//                     widget→html png pdf mp4 json (mp4 only when the widget registers a timeline)
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
- Live data with a free public JSON API (weather and wind: api.open-meteo.com; sunrise/sunset is in it too) → an agent step with the http tool and model "fast" that calls the API and returns json. Far cheaper and more exact than web research; use web research only when no API exists.
- Writing into other systems (CRM, database, spreadsheet, website): an agent step with the matching mcp server, http, or browser tool, preceded by a review step.
- The sandbox runs code (python/node) for calculations, charts or file conversion; export_file hands files to the person.
- Every step a person sees later (review/result) must come from an earlier step id.
- Write all wizard texts in the admin's language.`;

export const WIDGET_GUIDE = `
Widgets — when to use: the result must look the same every run, animate, or be explored (a map with
animated arrows, a timeline with a scrubber, a dashboard with filters, a configurator). Documents and
one-off pages stay "generate" steps. A widget is code in the wizard's WORKSPACE (files), written once:
- Files: "<widget>/index.html" (+ optional app.js, style.css), libraries under "lib/", reference data
  (GeoJSON shapes, station lists, price lists) as JSON/CSV files, and "<widget>/sample.json" with
  example data in exactly the shape of the step's data.
- Its data usually comes from an agent step with output.format "json"; give its table fields fixed
  "columns" so rows have known keys, and write sample.json in that exact shape.
- NO NETWORK when it runs: no CDN, no fetch, no external fonts or images — everything is inlined.
  Put libraries into the workspace (cdnjs.cloudflare.com, cdn.jsdelivr.net) and include them with
  <script src="lib/name.min.js">. Fetch reference data ONCE now (e.g. lake outlines
  from nominatim.openstreetmap.org/search?q=…&format=json&polygon_geojson=1&polygon_threshold=0.0005)
  and save it as a workspace file.
- Runtime, window.wizard: data · brand {name, accent, logo} · mode "view"|"export" · file(path) ·
  json(path) · url(path) (data URL for images/fonts) · ready() · timeline({ duration, seek, poster }).
- Animation: call wizard.timeline({ duration: seconds, seek: t => draw(t) }) and drive your own
  play/pause and <input type=range> scrubber from it. seek(t) must draw time t synchronously — the MP4
  export steps through it frame by frame. In mode "export" hide all controls and do not autoplay.
- Call wizard.ready() once the first frame is drawn. Lay out for the step's size and scale to fit
  the window on every "resize" event — the window can be 0×0 when your script first runs.
- Plain HTML/CSS/JS, SVG or canvas. Calm design, one accent colour (brand.accent), legible labels.
- After writing, ALWAYS run check_widget, read its errors and look at the screenshot; fix until clean.`;

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
${WIDGET_GUIDE}

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
