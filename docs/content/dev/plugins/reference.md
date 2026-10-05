---
title: Reference
description: Every call, type, address and setting of the plugin framework on one page.
---

## Server half

`import { definePlugin } from "@engenty-wizards/plugin-sdk"`

The default export is a `WizardsPluginFactory`: `(wizards: WizardsPluginApi) => void | Promise<void>`.

### `wizards`

| | Type | |
|---|---|---|
| `plugin` | `PluginManifest` | The manifest |
| `server` | `PluginServerApi` | Below |
| `config.get(key)` | `string \| undefined` | A setting of the install |
| `log.info`, `log.warn`, `log.error` | `(...args) => void` | A log line with the plugin's name |
| `resolvePath(relative)` | `string` | A file of the plugin as an absolute path |

### `wizards.server`

| Call | |
|---|---|
| `registerTool(tool: PluginTool)` | [Tools](./tools.md) |
| `registerHttpRoute(route: PluginRoute)` | [Routes](./routes.md) |
| `registerMigrations(folder: string)` | [Tables](./tables.md). The folder is relative to the plugin's |
| `on(event, listener)` | [Run events](./events.md). `event`: `"run.done"`, `"run.failed"`, `"run.cancelled"` |
| `getTenantDb(): PluginDb` | The current tenant's database, a Drizzle libSQL database |
| `onUnload(fn)` | Runs when the plugin unloads or loads again |

### `PluginTool`

```ts
interface PluginTool<S extends z.ZodType = z.ZodType> {
  name: string;           // lower case, digits and "_"
  title?: string;         // what the editor calls it
  description: string;    // for the model
  inputSchema: S;
  execute(input: z.infer<S>, step: PluginStepContext): unknown | Promise<unknown>;
}

interface PluginStepContext {
  runId: string;
  stepId: string;
  tenantId: string;
  project: { id: string; name: string };
  wizard: { title: string };
  signal: AbortSignal;                    // aborted when the run is cancelled
  emit(message: string): Promise<void>;   // tells the person what the step is doing
}
```

### `PluginRoute`

```ts
interface PluginRoute {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;                 // "/", "/items", "/items/:id"
  role?: "member" | "admin";    // "admin": owners and admins only
  handler(request: PluginRequest): unknown | Promise<unknown>;
}

interface PluginRequest {
  request: Request;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  user: { id: string; tenantId: string; role: "owner" | "admin" | "member"; name: string; email: string };
  json<T = unknown>(): Promise<T>;
}
```

### `PluginRunEvent`

```ts
interface PluginRunEvent {
  run: { id: string; wizardId: string; mode: "test" | "live"; status: "done" | "failed" | "cancelled" };
  wizard: { id: string; title: string; projectId: string };
  values: Record<string, unknown>;   // what the person answered, by field id
}
```

## Studio half

`import { defineStudioPlugin } from "@engenty-wizards/plugin-sdk/studio"`

The default export is a `StudioPlugin`: `(studio: StudioPluginContext) => void`.

| | |
|---|---|
| `studio.plugin` | `{ id, name, version }` |
| `studio.registerPage({ path, component, wide? })` | A page at `/studio<path>` |
| `studio.registerNav({ to, label, icon })` | An icon in the top bar. `label: () => string` |
| `studio.registerSettingsSection({ id, label, icon, component, menu? })` | A section at `/studio/settings/<id>` |
| `studio.i18n.register({ de, en })` | Gives `t(key, vars?)` |
| `studio.i18n.lang()` | `"de"` or `"en"` |
| `studio.api.get`, `.post`, `.put`, `.patch`, `.del` | The plugin's own routes |
| `studio.me()` | `{ user: { id, name, email }, tenant: { id, role }, mode: "managed" \| "local" }` |
| `studio.onUnload(fn)` | Runs when the studio half loads again |

## Ids and names

| | Rule | Example |
|---|---|---|
| Plugin id | Lower case, digits and `-`, starting with a letter, at most 40 characters | `run-log` |
| Tool name | Lower case, digits and `_`, starting with a letter, at most 40 characters | `recent` |
| Tool id in a wizard | `<plugin id>.<tool name>` | `run-log.recent` |
| Tool name for the model | The id with `_` for `.` and `-` | `run_log_recent` |
| Table name | Begins with the plugin's id | `run_log_entry` |
| Element around what a plugin draws | `data-plugin="<plugin id>"` | |

## Addresses

All below `/api/studio/plugins`, all signed in:

| Address | | Who |
|---|---|---|
| `GET /` | The tenant's plugins: id, name, version, tools, where the built files are, what did not load | Everyone |
| `ALL /<id>/…` | The plugin's own routes | Members of a tenant that has the plugin; `role: "admin"` routes owners and admins |
| `GET /-/assets/<id>/client.js`, `/client.css` | The built studio half | Members of a tenant that has the plugin |
| `GET /-/events` | A stream that says when a plugin loaded again | A runtime that runs alone |
| `POST /-/reload` | Loads every plugin again | Owners and admins, alone |
| `POST /-/reload/<id>` | Loads one plugin again | Owners and admins, alone |

The studio's addresses of a plugin: `/studio<path>` for its pages, `/studio/settings/<id>` for a
section.

## Settings

In the install's `.env`:

| Setting | | Default |
|---|---|---|
| `PLUGINS_DIR` | Folders to look for plugins in, comma-separated, besides the runtime's `modules/` | Installed app: `~/.engenty/wizards/plugins`. Checkout: none |
| `PLUGINS_WATCH` | `0`: plugins do not load again when their files change | `1` where the runtime runs alone. Never as the runtime of a Manage-App |
| `PLUGINS_DEFAULT` | Runtime of a Manage-App: ids of the plugins every tenant has | none |

## Files

| File | |
|---|---|
| `engenty.plugin.json` | The manifest: [Files and manifest](./layout.md#the-manifest) |
| `src/plugin.ts` | The server half |
| `migrations/*.sql` | Tables, where the server half registers the folder |
| `ui/plugin.tsx` | The studio half's source |
| `dist/client.js`, `dist/client.css` | The studio half, built by `node scripts/build-plugin.mjs <folder>` |

## In the repository

| | |
|---|---|
| `packages/plugin-sdk/src/` | The types, with their comments |
| `apps/runtime/src/plugins/` | Finding, loading, tables, events |
| `apps/runtime/src/routes/plugins.ts` | The addresses above |
| `apps/web/src/plugins/` | The studio's side |
| `scripts/build-plugin.mjs` | The build of a studio half |
| `apps/runtime/test/plugins.test.ts` | Loading, routes, tools, tables per tenant, reloading |
