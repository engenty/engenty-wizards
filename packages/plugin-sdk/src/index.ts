import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { z } from "zod";

/**
 * What the runtime hands a plugin's server half. A plugin is a file or a folder the runtime finds
 * at start (docs/content/dev/plugins); its default export is a factory that registers what it adds. The
 * runtime remembers every registration under the plugin's id and takes it back when the plugin
 * unloads or reloads.
 */

/** `engenty.plugin.json`, the file an engenty module has too. A plugin of one file has none. */
export interface PluginManifest {
  /** Lower case, digits and `-`: part of the plugin's addresses and of its tools' ids. */
  id: string;
  name: string;
  version: string;
  description?: string;
  kind?: string;
  provides?: string[];
  requires?: string[];
  /** The server half, from the plugin's folder. Default `src/plugin.ts`. */
  server?: string;
  /** The studio half, built. Default `dist/client.js`. */
  studio?: string;
  /** The studio half's styles, built. Default `dist/client.css`. */
  styles?: string;
}

export type PluginRole = "owner" | "admin" | "member";

/** The signed-in person a request acts as. */
export interface PluginPrincipal {
  id: string;
  tenantId: string;
  role: PluginRole;
  name: string;
  email: string;
}

export interface PluginRequest {
  /** The web request as it came in. */
  request: Request;
  /** The address below the plugin's own: `/` for `/api/studio/plugins/<id>/`. */
  path: string;
  /** What `:name` parts of the route's path matched. */
  params: Record<string, string>;
  query: URLSearchParams;
  user: PluginPrincipal;
  /** The body as JSON; an empty body is `{}`. */
  json<T = unknown>(): Promise<T>;
}

export type PluginHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** A route below `/api/studio/plugins/<id>`: signed in, inside the person's tenant. */
export interface PluginRoute {
  method: PluginHttpMethod;
  /** `/`, `/items`, `/items/:id`. */
  path: string;
  /** `admin`: owners and admins only. Default: every member. */
  role?: "member" | "admin";
  /**
   * Answers with a `Response`, or with a value that goes out as JSON. An error thrown with a
   * `status` and a `code` goes out as `{ error, code }` with that status.
   */
  handler(request: PluginRequest): unknown | Promise<unknown>;
}

/** A space: what all its wizards share. The runtime's own tables call it a project. */
export interface PluginSpace {
  id: string;
  /** What the studio's switcher calls it. */
  name: string;
}

/** What a tool knows about the step that calls it. */
export interface PluginStepContext {
  runId: string;
  stepId: string;
  tenantId: string;
  /** The space of the step's wizard. */
  space: PluginSpace;
  /** The same as `space`, by its older name. */
  project: { id: string; name: string };
  wizard: { title: string };
  /** Aborted when the run is cancelled. */
  signal: AbortSignal;
  /** Tells the person what the step is doing right now. */
  emit(message: string): Promise<void>;
}

/** A tool for agent steps. A step allowlists it as `<plugin id>.<name>`. */
export interface PluginTool<S extends z.ZodType = z.ZodType> {
  /** Lower case, digits and `_`. */
  name: string;
  /** What the editor calls it; default: the name. */
  title?: string;
  /** For the model: what the tool does and when to use it. */
  description: string;
  inputSchema: S;
  execute(input: z.infer<S>, ctx: PluginStepContext): unknown | Promise<unknown>;
}

/** A run that reached its end. It fires again when a finished run is redone and ends again. */
export interface PluginRunEvent {
  run: {
    id: string;
    wizardId: string;
    mode: "test" | "live";
    status: "done" | "failed" | "cancelled";
  };
  wizard: { id: string; title: string; projectId: string };
  /** What the person answered, by field id. */
  values: Record<string, unknown>;
}

/** A space was made, changed (title, about, colours, facts, systems) or deleted. */
export interface PluginSpaceEvent {
  space: { id: string };
}

/** A file of a space: read and ready (a document is in the index then), or removed. */
export interface PluginSpaceFileEvent {
  space: { id: string };
  file: { id: string; name: string; kind: "logo" | "asset" | "document"; mime: string };
}

export interface PluginEvents {
  "run.done": PluginRunEvent;
  "run.failed": PluginRunEvent;
  "run.cancelled": PluginRunEvent;
  "space.created": PluginSpaceEvent;
  "space.updated": PluginSpaceEvent;
  "space.deleted": PluginSpaceEvent;
  "space.file.ready": PluginSpaceFileEvent;
  "space.file.removed": PluginSpaceFileEvent;
}

/** The tenant's database. A plugin reads and writes its own tables with it. */
export type PluginDb = LibSQLDatabase<Record<string, never>>;

/** What a plugin asks a model. */
export interface PluginGenerateRequest<T = undefined> {
  prompt: string;
  system?: string;
  /** The answer as an object of this shape instead of text. */
  schema?: z.ZodType<T>;
  /** The tenant's model class. Default `standard`; `classifier` is the fast, cheap one. */
  model?: "classifier" | "standard" | "high" | "highest";
  maxOutputTokens?: number;
  /** Default: two minutes. */
  signal?: AbortSignal;
}

export interface PluginGenerateResult<T = undefined> {
  text: string;
  /** Set when the request had a `schema`. */
  object: T;
}

/** What a plugin adds to every agent step of a space's wizards. */
export interface PluginSpaceContext {
  /**
   * A block of the step's instructions, after what the space says about itself and its
   * documents: what the plugin holds for the space, and which of its tools read it. Empty or
   * null: the step gets neither the block nor the tools.
   */
  block(space: PluginSpace): string | null | Promise<string | null>;
  /** Tools the step gets with the block, named `<plugin>_<name>` for the model. */
  tools?: PluginTool[];
}

/** A text a plugin puts into a space's search index, beside the space's documents. */
export interface PluginIndexEntry {
  /** The space's id. */
  space: string;
  /** The plugin's own name for it: putting the same key again replaces what it had. */
  key: string;
  /** What a hit is called: a page's title, a question. */
  title: string;
  /** Markdown, cut into passages like a document's text. */
  text: string;
  /** Where the studio shows it, an address of the studio: `/space#faq`. */
  link?: string;
}

export interface PluginIndex {
  /** Puts the entry in; `project_search` finds it from then on. */
  put(entry: PluginIndexEntry): Promise<void>;
  /** Takes one key out, or without a key every entry of the plugin in the space. */
  remove(space: string, key?: string): Promise<void>;
}

/** A Kategorie of a space: a typed property set on pages, tables, rows and files of Wissen. */
export interface PluginCategory {
  name: string;
  type: "choice" | "date" | "number" | "text" | "boolean";
  /** A number's unit: `h`, `€`, `kg`. */
  unit?: string;
  /** A choice: several values per item. */
  multiple?: boolean;
  /** A choice whose values are ranked, in the order of `values`. */
  ordered?: boolean;
  /** Where its values come from, in a few words: "Kopfzeile", "Filter der Website". */
  hint?: string;
  /** A choice's values, known beforehand: a site's filter. Others are added as items bring them. */
  values?: string[];
  /** A column of a table the plugin wrote (by the table's key) whose cells are its values. */
  column?: { table: string; column: string };
}

/**
 * Kategorien of an item, by their names: a choice's value (or a list of them), a day as
 * `YYYY-MM-DD`, a number, a short text, true or false. Null takes one off.
 */
export type PluginCategoryValues = Record<
  string,
  string | number | boolean | (string | number)[] | null
>;

/** The original an item was read from, kept as the evidence beside it. */
export interface PluginOriginal {
  name: string;
  mime: string;
  data: Uint8Array;
}

/** `written`: the plugin's version stands. `kept`: a person changed it, the plugin no longer writes it. */
export type PluginItemState = "written" | "kept";

export interface PluginPageInput {
  space: string;
  /** The plugin's own name for the page: the same key again rewrites it, never doubles it. */
  key: string;
  /** What the person knows its source as: "Tagesberichte". */
  label?: string;
  title: string;
  markdown: string;
  /** The key of a page the plugin wrote before, to stand under it as a sub-page. */
  parent?: string;
  position?: number;
  original?: PluginOriginal;
  categories?: PluginCategoryValues;
  /** A model fills the space's Kategorien the page did not get from `categories`. */
  fill?: boolean;
  /** Why a person should look at it ("hardly readable"); shown in Wissen. */
  review?: string | null;
}

export interface PluginTableInput {
  space: string;
  key: string;
  label?: string;
  title: string;
  /** Typed columns, as a table of the space has them (`text`, `number`, `date`, `select` …). */
  columns: unknown[];
  /** Cells by column id. They replace the rows the key had. */
  rows: Record<string, unknown>[];
  /** `faq`: a question and its answer per row. */
  format?: "faq";
  original?: PluginOriginal;
  categories?: PluginCategoryValues;
  review?: string | null;
}

export interface PluginFileInput {
  space: string;
  key: string;
  label?: string;
  name: string;
  mime: string;
  data: Uint8Array;
  /** What it is, in a sentence: a file that is no page is found by its name and this. */
  description?: string;
  /** What a step reads of it, when there is text. */
  text?: string;
  categories?: PluginCategoryValues;
}

export interface PluginDocumentInput {
  space: string;
  key: string;
  label?: string;
  name: string;
  mime: string;
  data: Uint8Array;
  /** Set on what it becomes: its first page, its first table, or the file. */
  categories?: PluginCategoryValues;
  /** A model fills the space's Kategorien it did not get from `categories`. */
  fill?: boolean;
}

/** What a document became: pages and tables (the first is the one it is found as), or a file. */
export interface PluginDocumentResult {
  /** The file, kept as the original. */
  id: string;
  path: string;
  state: PluginItemState;
  items: { kind: "page" | "table"; id: string; path: string; title: string }[];
  /** Why a person should look at it: hardly readable, or not readable at all. */
  review: string | null;
}

/** What a plugin wrote into a space. */
export interface PluginSpaceItem {
  key: string;
  kind: "page" | "table" | "file";
  id: string;
  title: string;
  /** How a step names it: `pages/…`, `tables/…`, `files/…`. */
  path: string;
  state: PluginItemState;
  review: string | null;
  updatedAt: string;
}

/**
 * Wissen of a space, written by a plugin: pages, tables and files under keys of its own, with
 * their Kategorien. Every write is indexed: `project_search` finds it a moment later.
 */
export interface PluginSpaceData {
  /**
   * Adds Kategorien to the space, or values to ones it has. `proposed`: shown to the person to
   * confirm, never filled before; a later call without it takes them.
   */
  putCategories(input: {
    space: string;
    categories: PluginCategory[];
    proposed?: boolean;
  }): Promise<void>;
  putPage(input: PluginPageInput): Promise<{ id: string; path: string; state: PluginItemState }>;
  putTable(input: PluginTableInput): Promise<{ id: string; path: string; state: PluginItemState }>;
  putFile(input: PluginFileInput): Promise<{ id: string; path: string }>;
  /**
   * A document read as an upload is: a page (sub-pages when it is long and has headings of its
   * own), a table per sheet of a workbook, or a file when nothing reads it. The document stays as
   * the original. The same key again reads it again, unless a person changed what it became.
   */
  putDocument(input: PluginDocumentInput): Promise<PluginDocumentResult>;
  /** Everything the plugin wrote into the space. */
  list(space: string): Promise<PluginSpaceItem[]>;
  /** Takes out one key, or every item of the plugin in the space; what a person changed stays. */
  remove(space: string, key?: string): Promise<number>;
  /**
   * Writes the Übersicht of values: of one, or of every value of a choice (or of every choice)
   * that has three items or more. Returns how many were written. Costs a model call each.
   */
  summarize(space: string, category?: string, value?: string): Promise<number>;
}

/** What a tool of the space assistant knows about the turn that calls it. */
export interface PluginAssistantContext {
  tenantId: string;
  space: PluginSpace;
  /** The person talking to the assistant. */
  userId: string;
  /** Aborted when the person leaves or stops the turn. */
  signal: AbortSignal;
  /** Tells the person what the assistant is doing right now: "Liest die Sitemap …". */
  emit(message: string): void;
  /** Say so when the tool changed what the space page shows: the page draws it again. */
  changed(): void;
}

/** A tool of the space assistant: the chat on the space page that fills the space in. */
export interface PluginAssistantTool<S extends z.ZodType = z.ZodType> {
  /** Lower case, digits and `_`. The model sees it as `<plugin>_<name>`. */
  name: string;
  /** For the model: what the tool does and when to use it. */
  description: string;
  inputSchema: S;
  /**
   * The result also goes to the chat, where the card the studio half registered for this tool
   * (`registerAssistantCard`) draws it. It is sent as it is: keep such a result small.
   */
  card?: boolean;
  execute(input: z.infer<S>, ctx: PluginAssistantContext): unknown | Promise<unknown>;
}

/** A page of the web, as `web.read` gives it. */
export interface PluginWebPage {
  /** Where it ended up, after redirects. */
  url: string;
  status: number;
  /** As the server sent them, for asking later whether the page changed. */
  etag: string | null;
  lastModified: string | null;
  title: string;
  description: string;
  /** The page's text as Markdown. */
  text: string;
  /** Every link of the page, absolute, each once. */
  links: { url: string; text: string }[];
}

export interface PluginWeb {
  /**
   * `fetch`, behind the guard of the runtime's own requests: addresses of this machine and of
   * the local network are refused, after a redirect too.
   */
  fetch(url: string, init?: RequestInit): Promise<Response>;
  /**
   * A page read the way the space assistant reads one: guarded as `fetch`, and drawn in a
   * browser when it has hardly any text without its scripts.
   */
  read(url: string, options?: { signal?: AbortSignal }): Promise<PluginWebPage>;
}

export interface PluginDocuments {
  /**
   * A file as Markdown: PDF and Word by their text, scans and photos by a vision model (paid
   * like every model call), spreadsheets as tables. Kept by content: the same bytes are read once.
   */
  parse(
    file: { data: Uint8Array; name: string; mime: string },
    options?: { signal?: AbortSignal },
  ): Promise<{ markdown: string; pages: number | null }>;
}

/** One turn of a job `every` runs. */
export interface PluginTick {
  tenantId: string;
  /** When it ran for this tenant before; null the first time. */
  lastRun: Date | null;
  /** Aborted when the plugin unloads. */
  signal: AbortSignal;
}

/** What a public route's handler gets. Nobody is signed in. */
export interface PluginPublicRequest {
  request: Request;
  /** The address below the plugin's public one. */
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  /** The tenant whose address was called; the handler runs inside it. */
  tenantId: string;
  json<T = unknown>(): Promise<T>;
}

/**
 * A route anyone may call, below the address `publicUrl` gives: a CMS that says a page
 * changed, a service's webhook. Check a secret of your own in it, a token or a signature.
 */
export interface PluginPublicRoute {
  method: PluginHttpMethod;
  path: string;
  handler(request: PluginPublicRequest): unknown | Promise<unknown>;
}

export interface PluginServerApi {
  registerHttpRoute(route: PluginRoute): void;
  registerTool<S extends z.ZodType>(tool: PluginTool<S>): void;
  /** A block and tools for every agent step of a space's wizards. */
  registerSpaceContext(context: PluginSpaceContext): void;
  /** A tool of the space assistant. */
  registerAssistantTool<S extends z.ZodType>(tool: PluginAssistantTool<S>): void;
  registerPublicRoute(route: PluginPublicRoute): void;
  /** The full address of a public route for the current tenant: what to hand to whoever calls it. */
  publicUrl(path: string): Promise<string>;
  /**
   * Runs `handler` for every tenant that has the plugin, at most once per `everyMs` (a minute
   * at least), inside that tenant. When it ran is kept: a restart does not start the count again,
   * and a runtime that was off runs it once when it starts, not once per turn it missed. One turn
   * per tenant at a time; a turn that throws counts as run.
   */
  every(name: string, everyMs: number, handler: (tick: PluginTick) => void | Promise<void>): void;
  /** The space's search index, which `project_search` asks. */
  index: PluginIndex;
  /** Wissen of a space: pages, tables and files the plugin writes, with their Kategorien. */
  spaceData: PluginSpaceData;
  web: PluginWeb;
  documents: PluginDocuments;
  /**
   * A folder of `.sql` files with the plugin's own tables. Every tenant database gets each file
   * once, in the order of the file names. Nothing is taken back when the plugin unloads.
   */
  registerMigrations(folder: string): void;
  /** The listener runs inside the tenant the event belongs to. */
  on<E extends keyof PluginEvents>(
    event: E,
    listener: (payload: PluginEvents[E]) => void | Promise<void>,
  ): void;
  /** The database of the tenant the current request, step or event belongs to. */
  getTenantDb(): PluginDb;
  /**
   * Asks a model of the current tenant, on the models its studio is set up with; the call is
   * paid like any other of the tenant's. When no model is set up it throws an error with the
   * status 503 and the code `no_model`, which a route passes on as it is.
   */
  generate<T = undefined>(request: PluginGenerateRequest<T>): Promise<PluginGenerateResult<T>>;
  /** Something to undo when the plugin unloads or reloads: a timer, a socket. */
  onUnload(dispose: () => void | Promise<void>): void;
}

export interface WizardsPluginApi {
  plugin: PluginManifest;
  server: PluginServerApi;
  /** Settings of this install: its `.env`. Name them after the plugin (`NOTIFY_URL`). */
  config: { get(key: string): string | undefined };
  log: {
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
  };
  /** A file of the plugin as an absolute path. */
  resolvePath(relative: string): string;
}

export type WizardsPluginFactory = (wizards: WizardsPluginApi) => void | Promise<void>;

/** Types the factory; it does nothing else. */
export function definePlugin(factory: WizardsPluginFactory): WizardsPluginFactory {
  return factory;
}
