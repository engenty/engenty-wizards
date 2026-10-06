import { sandboxGuideLine } from "../sandbox/index.js";
import { EXAMPLE_WIZARD } from "./example.js";

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
  lists?: List[]                // tabular data the wizard KEEPS between runs — separately for each person who runs it, or for all with "shared"
  connections?: Connection[]    // accounts the PERSON connects during a run (their mailbox); kept for their next run
  steps: Step[]                 // run top to bottom; the LAST step is always a "result"
}

type List = {
  id, title, description?,
  key?: columnId                // rows are matched on this column: saving a row with a known key updates that row
  shared?: true                 // ONE list for every run (leads, sign-ups, bookings, a log) instead of one per person.
                                //   The person running the wizard never sees it: no list field, review or deliverable of it;
                                //   the admin sees and edits it in the studio under Space → Daten
  check?: { file?: columnId, status?: columnId }
                                // a review that shows the list lets the person go through it ROW BY ROW on a split screen:
                                //   "file" = a text column holding the path of a kept file (PDF, photo), previewed beside the row;
                                //   "status" = a select column whose options are the answer buttons (the FIRST option = not looked at yet)
  columns: Column[]             // { id (lowercase_slug), name (shown to the person), type, format?, required? }
}
//   type "text":    format? { style: "single"|"multiline" }
//   type "number":  format  { style: "integer"|"decimal"|"percent"|"currency", currency?: "EUR" }   // currency only with style "currency"
//   type "date":    format  { kind: "date"|"datetime" }          // values are YYYY-MM-DD
//   type "select":  format  { options: { id, label }[], allowCustom: boolean }
//   type "boolean"

type Connection =
  | { id, kind: "mail", title?, description? }
      // the person picks how to connect (Gmail, Outlook, or any mailbox over IMAP); steps only ever READ it
  | { id, connector: connectorId, actions?: actionId[], policy?: { [actionId]: "allow"|"ask" }, title?, description? }
      // connector = a service the wizard works in for the person: a built-in one (Gmail, Google Drive, Calendar and
      //   Contacts, Outlook, OneDrive, Slack, GitHub, HubSpot, S3) or one imported into the project from the
      //   integrations registry. The person connects their own account (OAuth or API key) on a page.
      //   kind "mail" reads any mailbox the same way and keeps attachments as files; use the gmail / outlook
      //   connectors only for what it cannot do (drafts, sending, labels, calendar).
      // A step that lists the connection gets the connector's actions as tools named <toolPrefix>_<actionId>.
      //   actions: exactly the actions the wizard may use. Default: only those marked "read".
      //   policy: "allow" = runs without asking, "ask" = the person confirms each call first.
      //           Default: read → allow, write → ask. Deleting always asks. Set "allow" for an action marked
      //           "write" that in truth only looks something up (MCP servers often leave the mark out).

// Every step: { id (camelCase, unique), title, description?, next?: Branch[] }
// Branch = { when: { field, op: "equals"|"notEquals"|"in"|"notEmpty"|"empty", value? }, goto: stepId | "end" }
//   field is a page field id, or an output field of this or an earlier agent step as "steps.<stepId>.<fieldId>"
//   first matching branch wins, otherwise the next step in the list.

type PageStep = { type: "page", fields: Field[] (1–5 per page), cta?: string }
type Field = {
  id (camelCase, unique across the WHOLE wizard), label, kind, required?, placeholder?, help?,
  options?: string[]            // select / multiselect
  default?: string|number|boolean|string[]
  columns?: { id, label, kind: "text"|"number"|"money" }[]   // items only; row amount = product of number/money columns
  vat?: { rate?: number, field?: fieldId }                    // items only; VAT % fixed or read from a field
  currency?: "EUR"|...                                        // items only
  multiple?: boolean            // image / file: several files, in the order the person puts them (they can drag them)
  min?: number, max?: number    // image / file with multiple: how many files at least / at most (up to 30). Set max wherever
                                //   every file costs something later (a video clip per photo)
  camera?: boolean              // file: also offer the camera, for papers the person has not scanned (image always offers it)
  video?: boolean               // file: the camera also records a short clip (up to 30 s); the clip is a file like any other
  scan?: boolean                // text: a "scan" button fills it from a QR code or barcode (serial number, ticket, article number)
  connection?: connectionId     // kind "connection": the page shows "connect your account"; with required the person must connect
  list?: listId                 // kind "list": the page shows that stored list for the person to check, correct and extend
  prefill?: "steps.<id>.<key>"  // what the field starts with, from an earlier step. An "items" field takes a table whose
                                //   columns are exactly its column ids — the step proposes the positions, the person corrects them
}
// kinds: text textarea number select multiselect date email url toggle color image file items connection list
//        location audio signature
//   location:  where the person is — the phone's position on a tap (with its accuracy), or an address they type.
//              {{field}} → "Herrengasse 16, 8010 Graz (47.07071, 15.43950, ±12 m)" · {{field.lat}} {{field.lng}}
//              {{field.accuracy}} (metres) · {{field.label}} (the address line) · {{field.map}} (a map link).
//              A typed address has no lat/lng. Widgets take the numbers: data { lat: "place.lat", lng: "place.lng" }.
//   audio:     a voice note recorded on the page (up to 5 minutes). It is written down before the next step runs:
//              {{field}} is what the person said, as text. {{field.seconds}} is its length.
//   signature: drawn with the finger — a picture (dark ink, clear ground). A document step can place it:
//              {{field}} → asset://ID, used as <img src="asset://ID">.

type AgentStep = {
  type: "agent"
  instructions: string          // the task, with {{templates}}
  tools: ("web_search"|"web_fetch"|"browser"|"sandbox"|"image"|"http"|"pages")[]
  mcp?: string[]                // ids of the project's MCP servers this step may use
  connections?: string[]        // ids of wizard connections this step may read (mail → mail_search, mail_read, mail_save)
  output: { format: "text"|"markdown"|"json", fields?: { id, kind: "text"|"number"|"list"|"table"|"yesno"|"choice", description, columns?: string[], options?: string[] }[] }
                                // a table with columns gives rows as objects with exactly those keys — what widgets read
                                // "yesno" answers the question in its description with true/false; "choice" picks one of its options
  model?: "classifier"|"standard"|"high"|"highest"  // the kind of model, see "Models"; default "high"
  effort?: "low"|"medium"|"high"                    // how hard it should think; leave out unless it matters
  working?: string              // shown while it runs ("Recherchiert im Web …")
}
// Every agent step also has, without listing them: list_read / list_write (the wizard's lists), files_list,
//   read_document (PDF, scans and photos, Word, Excel, CSV, saved mails) and scan_documents (invoice / receipt fields, many at once).
// "pages" brings: page_read / page_write — Markdown pages of the space the wizard keeps for every run (notes, a log
//   that grows with append), shown to the admin under Space → Daten; page_read also reads the space's own pages.
// "browser" brings: browser_open/click/type, browser_screenshot (the model looks at the page),
//   browser_request_credentials (the PERSON types a login into the page — the model never sees it; sign-ins can be remembered),
//   browser_request_user (the person solves a captcha or "continue with Google" in a picture of the page),
//   browser_download (keeps a file from a signed-in site).

type GenerateStep = {
  type: "generate"
  asset: "image"|"video"|"voice"|"document"|"dashboard"
  prompt: string                // the brief, with {{templates}}; for "voice" the exact text that is read aloud
  options?: { aspectRatio?: "1:1"|"16:9"|"9:16"|"4:5"|"3:2"|"2:3", duration?: 4–10 (video seconds; 4, 6 or 8 are safe),
              resolution?: "720p"|"480p",   // video: 720p by default and at most; 480p for drafts and many clips
              style?: string,   // image/video: the look · voice: how to speak ("ruhig, warm")
              template?: "invoice"|"offer"|"briefing"|"letter"|"report"|"free" }   // template for documents
  referenceImage?: fieldId | stepId   // the image the image/video starts from: an image field, or an earlier step that made images
  each?: fieldId | stepId | "steps.<id>.<key>"
                                // image/video: ONE RESULT PER ENTRY (at most 8) — per upload of an image field (multiple), per image
                                //   of an earlier step, or per row of an agent step's table. The prompt reads the row as
                                //   {{item.<column>}} (plus {{index}}, {{count}}); referenceImage gives entry n its n-th image.
                                //   With each the prompt goes to the model AS WRITTEN (no rewriting step): let the agent step
                                //   that makes the table write complete visual descriptions.
                                //   In a review the person can make single results again.
  working?: string
}

type WidgetStep = {
  type: "widget"
  entry: string                 // workspace path of the widget's HTML, e.g. "weather/index.html"
  data: { [key]: string }       // what the widget gets as wizard.data: key → fieldId | steps.stepId | steps.stepId.key | brand.name | facts.key | today
  sample?: string               // workspace path of example data (same shape as data) for previews
  size?: { width, height }      // design size in px, default 1280×720 (9:16 → 1080×1920)
  video?: boolean               // a FILM: the timeline is rendered to an MP4 WITH SOUND when the step runs; the person sees and
                                //   downloads that video. data may then name generate steps: "steps.<id>" of an image / video / voice
                                //   step arrives as a URL (a list of URLs for a step with "each").
  working?: string
}
// an interactive HTML app written ONCE into the workspace; every run only brings new data (no model call, no cost)

type ReviewStep = { type: "review", show: (stepId | "lists.<listId>")[], edit?: boolean, regenerate?: boolean }
// shows earlier outputs; the person accepts, edits text outputs (edit), or asks for a new version with a note (regenerate)
// a shown list is edited in place by the person

type ResultStep = { type: "result", message?: string, deliverables: { from: stepId | "lists.<listId>", label?, formats: Format[] }[] }
// formats per source: image→png · video→mp4 (several results: zip) · voice→mp3 · document→pdf docx html md png · dashboard→html pdf png
//                     film widget (video: true)→mp4 png
//                     widget→html png pdf mp4 json (mp4 only when the widget registers a timeline)
//                     agent text/markdown→md txt docx pdf html · agent json→json csv xlsx md (xlsx: one sheet per table)
//                     agent, any format→zip: the FILES the step kept with mail_save / browser_download
//                     lists.<id>→xlsx csv json md · zip (a list with check.file: the kept files its rows name, plus the list)

Templates (in instructions/prompt): {{fieldId}} · {{steps.stepId}} (whole output) · {{steps.stepId.key}} (json key)
  · {{itemsField}} (line items as a table WITH computed net/VAT/total) · {{itemsField.net|vat|gross}} · {{today}}
  · the project (its settings): {{brand.name}} {{brand.about}} {{brand.colors}} · {{facts.key}} (one fact: address, VAT id, …) · {{facts}} (all facts)
    — every AI step already knows them, name one only where the text must carry it; agent steps can also search the project's documents
  · {{lists.listId}} (the stored list as a table, as it is when the step starts) · {{fileField}} (the names of the uploads, for read_document)
  · {{locationField}} {{locationField.lat|lng|accuracy|label|map}} · {{audioField}} (the transcript) · {{signatureField}} (asset://ID)
A template may only use fields asked and steps run EARLIER.`;

export const PRINCIPLES = `
How good wizards look:
- For non-technical end users. Plain words, friendly titles phrased as questions ("Wofür ist der Post?").
- Few pages, 1–5 fields each, one theme per page. Only ask what the result really needs; prefer selects with sensible defaults.
- Put a review step before anything expensive (video) and before the final result, so people can correct or regenerate.
- Money/totals: use an "items" field with vat — the runner computes totals; documents must use {{items}} verbatim. Never let a model compute totals.
- Facts from the web need an agent step with web_search + web_fetch BEFORE writing; documents then cite those notes.
- Live data with a free public JSON API (weather and wind: api.open-meteo.com; sunrise/sunset is in it too) → an agent step with the http tool and model "standard" that calls the API and returns json. Far cheaper and more exact than web research; use web research only when no API exists.
- Writing into other systems (CRM, database, spreadsheet, website): an agent step with the matching mcp server, http, or browser tool, preceded by a review step.
${sandboxGuideLine()}
- Remembering between runs ("merke dir", "führe eine Liste"): declare a list and let an agent step save into it with list_write; a later run reads it as {{lists.id}} or list_read. Give it a key column so known rows are updated, not duplicated. Never make the person re-upload last time's result.
- Collecting from everyone who runs the wizard (requests, leads, sign-ups, feedback): a list with "shared": true, saved with list_write. It is the admin's, under Space → Daten; never show one person's rows to another. Longer text for every run (a running summary, a log): the "pages" tool.
- The person's mail: one connection of kind "mail", a page field of kind "connection" early in the wizard, and the agent step lists it in "connections". Do not ask for the provider or the address in other fields — the connect field does that.
- Working in a service for the person (read their Notion, create an issue, look up a customer): import the service as a connector, declare a connection with "connector", put a page field of kind "connection" before the step, and list the connection in the step's "connections". Prefer a connector over the browser whenever the service has one.
- Logins on websites: never ask for passwords in page fields. An agent step with the browser tool asks the person at the moment it meets the login (browser_request_credentials); write that into its instructions, and that it must go on without the site when the person skips.
- Most people open a wizard on their phone. Keep pages short, and let the phone do the typing: photos with an "image" field (multiple) instead of descriptions, the place with a "location" field instead of an address form, what happened as an "audio" field instead of a long textarea (keep an optional textarea beside it), a sign-off as a "signature" field, a serial or ticket number as a "text" field with scan. Typical: damage report, handover protocol, site inspection, delivery note.
- Photos in documents: a document step can place the photos of an earlier "image" field and a "signature" (it gets them as asset:// images); say in its prompt where they go.
- Looking at photos: an agent step whose instructions name an image field ({{photos}}) gets up to 8 of its photos attached and sees them itself, in the person's order — do not tell it to call read_document for them. Photos in a "file" field, PDFs and scans are read with read_document / scan_documents.
- Papers and scans: a "file" field with multiple and camera. Agent steps read uploads with read_document; for invoices and receipts scan_documents returns the fields (vendor, number, date, totals, currency) exactly as printed.
- Collecting documents (invoices from mail or portals): the step keeps each file with mail_save / browser_download under a dated path ("invoices/2026-09/2026-09-03_Notion_INV-123.pdf"); its deliverable offers "zip". Split a big job into steps (mail, then statements, then portals) — one step manages about 60 tool calls.
- Going through documents one by one (receipts against payments): never one model step per document. One step reads them in batches (scan_documents takes 30 at once) and writes rows into a list with "check"; the review shows that list split-screen — the person answers each row beside its file, without any model call.
- Video that convinces is built in stages, each with its own review: idea and script (agent, json with a table of shots) → one still per shot (generate image with "each", starting from the person's product photo) → one clip per still (generate video with "each" and referenceImage = the stills step) → a voice-over (generate voice) → a film widget (video: true) that cuts clips, captions, voice and a closing card with the call to action. The starters "facebook-video-ad" and "property-film" carry such a widget (film/film.js) to copy. Offer a cheaper path without clips: the film animates the stills.
- Prices come from a file the admin keeps in the workspace (a CSV price list): the agent step looks them up with read_workspace_file and proposes positions as a table; the next page shows them in an "items" field with "prefill" for the person to correct; the runner computes the totals.
- AI media is marked for you (EU AI Act, Art. 50): images, clips, voice-overs and films carry the marking in their file metadata, and the pages lay the EU's "AI" label over them. Never ask an image step to draw such a label into the picture. A film is different — it leaves the page as a video file, so its widget shows the EU label in the picture: wizard.ai tells a widget whether the run's media in its data is "generated" or "edited" (film/film.js draws the matching icon).
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
- Runtime, window.wizard: data · brand {name, accent, logo, colors [{name, value}], facts {key: value}} · ai "generated"|"edited"|null · mode "view"|"export" · file(path) ·
  json(path) · url(path) (data URL for images/fonts) · ready() · timeline({ duration, seek, poster }).
- Animation: call wizard.timeline({ duration: seconds, seek: t => draw(t) }) and drive your own
  play/pause and <input type=range> scrubber from it. seek(t) must draw time t synchronously — the MP4
  export steps through it frame by frame. In mode "export" hide all controls and do not autoplay.
- A film (step.video): seek(t) may return a promise that resolves once the frame is drawn (set a clip's
  currentTime, wait for "seeked", draw it to a canvas). Name the sound in the timeline:
  audio: [{ src, start, duration?, volume? }] with the URLs from wizard.data (the voice-over, the clips
  themselves for their own sound). Clips and images of the run arrive as URLs, not inlined.
- Call wizard.ready() once the first frame is drawn. Lay out for the step's size and scale to fit
  the window on every "resize" event — the window can be 0×0 when your script first runs.
- Plain HTML/CSS/JS, SVG or canvas. Calm design, one accent colour (brand.accent), legible labels.
- After writing, ALWAYS run check_widget, read its errors and look at the screenshot; fix until clean.`;

export interface GuideServer {
  id: string;
  name: string;
}

export interface GuideConnector {
  id: string;
  name: string;
  toolPrefix: string;
  /** Whether people can connect an account on this server right now. */
  usable: boolean;
  actions: { id: string; group: string }[];
}

export function connectorsLine(connectors: GuideConnector[]): string {
  const lines = connectors.map((c) => {
    const actions = c.actions
      .slice(0, 40)
      .map((a) => `${a.id}${a.group === "read" ? "" : ` (${a.group})`}`)
      .join(", ");
    const more = c.actions.length > 40 ? `, … ${c.actions.length - 40} more (list_connectors)` : "";
    const state = c.usable
      ? ""
      : " — NOT SET UP on this server: tell the admin before you build on it";
    return `- ${c.id} — ${c.name}${state}, tools ${c.toolPrefix}_*: ${actions || "actions appear once an account is connected"}${more}`;
  });
  return `Connectors a wizard of this project can use (built in, or imported from the integrations registry; find more with find_connectors + import_connector):\n${lines.join("\n")}`;
}

export interface GuideTool {
  /** `<plugin>.<tool>`, as a step lists it. */
  id: string;
  description: string;
}

/** The tools this app's plugins add; nothing where there are none. */
export function pluginToolsLine(tools: GuideTool[]): string {
  if (!tools.length) {
    return "";
  }
  const lines = tools.map((t) => `- ${t.id} — ${t.description}`);
  return `\n\nTools of this app's plugins. An agent step lists one in "tools" by its full id, next to the built-in ones; a wizard that uses one runs only where that plugin is installed:\n${lines.join("\n")}`;
}

export function mcpServersLine(mcp: GuideServer[]): string {
  return `Project MCP servers available to agent steps: ${mcp.length ? mcp.map((m) => `${m.id} (${m.name})`).join(", ") : "none — if the admin wants to write into an external system that needs one, build the step with http or browser, and tell them they can connect a server in the project settings"}.`;
}

export function exampleWizard(): string {
  return JSON.stringify(EXAMPLE_WIZARD, null, 2);
}

/** The guide an MCP client reads before it writes a wizard. */
export function authoringGuide(
  mcp: GuideServer[],
  connectors: GuideConnector[] = [],
  pluginTools: GuideTool[] = [],
): string {
  return `engenty wizards: a wizard is a page-by-page flow an end user walks through on a shared link. Pages ask questions; AI steps research, write, draw images, render video, build documents and dashboards, or write into other systems. You author the wizard as JSON; the person who asked you is the ADMIN, the people who later open the link are END USERS.

${SCHEMA_DOC}
${PRINCIPLES}
${WIDGET_GUIDE}

${mcpServersLine(mcp)}

${connectorsLine(connectors)}${pluginToolsLine(pluginTools)}

Models: a step names the KIND of model it needs, never a model. Pick the cheapest class that does the job:
- "classifier": routing, yes/no, picking from options, pulling a few values out of text.
  A DECISION is a "classifier" step with no tools whose json output has only "yesno" and "choice" fields: it is answered in one fast, very cheap call. Write the question into each field's description, give the step everything it must judge in its instructions via {{templates}}, and branch on the answer with "next" (e.g. { when: { field: "steps.check.refund", op: "equals", value: true }, goto: "refund" }).
- "standard": short copy, calling an API, reformatting, simple summaries.
- "high": research with tools, long documents, reasoning over many sources (the default).
- "highest": hard reasoning or writing code; rare in a run, several times the cost of "high".
"effort" ("low" | "medium" | "high") tells the model how hard to think where it can be told; leave it out unless a step is clearly trivial ("low") or clearly hard ("high").
A generate step for a document or dashboard takes the same "model" (default "high"). Image and video steps use the image and video class; which model serves a class is set by the platform, not in the wizard.

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
