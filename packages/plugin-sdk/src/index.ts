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

/** What a tool knows about the step that calls it. */
export interface PluginStepContext {
  runId: string;
  stepId: string;
  tenantId: string;
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

export interface PluginEvents {
  "run.done": PluginRunEvent;
  "run.failed": PluginRunEvent;
  "run.cancelled": PluginRunEvent;
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

export interface PluginServerApi {
  registerHttpRoute(route: PluginRoute): void;
  registerTool<S extends z.ZodType>(tool: PluginTool<S>): void;
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
