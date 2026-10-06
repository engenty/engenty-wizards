---
title: The server half
description: The function a plugin exports, what it is handed, and the rules it runs under.
---

The server half is a file whose default export is a function. The runtime calls it once when the
plugin loads and hands it `wizards`. The function registers what the plugin adds.

```ts
import { definePlugin } from "@engenty-wizards/plugin-sdk";

export default definePlugin((wizards) => {
  const { server } = wizards;

  server.registerMigrations("migrations");
  server.registerHttpRoute({ method: "GET", path: "/", handler: async () => ({ ok: true }) });
  server.registerTool({ /* … */ });
  server.on("run.done", async (event) => { /* … */ });
});
```

`definePlugin` only types the function. The function may be `async`.

## What it is handed

| | |
|---|---|
| `wizards.server` | Registers tools, routes, tables and listeners. See the table below |
| `wizards.plugin` | The manifest: `id`, `name`, `version` and whatever else it holds |
| `wizards.config.get(key)` | A setting of the install: a line of its `.env`. Empty and missing are both `undefined` |
| `wizards.log.info`, `.warn`, `.error` | A log line with the plugin's name in front |
| `wizards.resolvePath(relative)` | A file of the plugin as an absolute path |

| `wizards.server.` | Does | Page |
|---|---|---|
| `registerTool(tool)` | A tool for AI steps | [Tools](./tools.md) |
| `registerSpaceContext(context)` | A block and tools for every AI step of a space | [The space](./space.md) |
| `registerAssistantTool(tool)` | A tool of the space assistant | [The space](./space.md#tools-of-the-space-assistant) |
| `index.put(entry)`, `index.remove(space, key?)` | Texts in the space's search index | [The space](./space.md#the-search-index) |
| `registerHttpRoute(route)` | A route below `/api/studio/plugins/<id>` | [Routes](./routes.md) |
| `registerPublicRoute(route)`, `publicUrl(path)` | A route anyone may call, and its address | [Routes](./routes.md#public-routes) |
| `registerMigrations(folder)` | `.sql` files with the plugin's tables | [Tables](./tables.md) |
| `on(event, listener)` | Called when a run ends or a space changes | [Events](./events.md) |
| `every(name, everyMs, handler)` | A job, again and again | below |
| `web.fetch(url, init?)`, `web.read(url)` | Requests to the web, guarded | below |
| `documents.parse(file)` | A file as Markdown | below |
| `getTenantDb()` | The database of the tenant the current request, step or event belongs to | [Tables](./tables.md) |
| `generate(request)` | Asks a model of the current tenant | below |
| `onUnload(fn)` | Something to undo when the plugin unloads | below |

## Settings

Name a plugin's settings after the plugin and read them when the plugin loads:

```ts
const url = wizards.config.get("NOTIFY_URL");
if (!url) {
  wizards.log.warn("NOTIFY_URL is not set: nothing will be sent.");
  return;
}
```

The person sets them in the install's `.env` and restarts. There is no settings page a plugin
gets for free: a plugin that wants one adds a [settings section](./studio.md) and keeps the
values in a [table](./tables.md).

## Tenants

A runtime serves one tenant on a person's computer and many as the runtime of a Manage-App.
Either way a plugin never names a tenant:

- A route, a tool and a listener each run inside one tenant.
- `server.getTenantDb()` is that tenant's database. Call it where you use it, not once at load
  time: at load time there is no tenant.
- State kept in a variable of the module is shared by all tenants. Keep per-tenant state in a
  table.

## Asking a model

`server.generate` asks one of the tenant's models, the same ones its wizards run on, and is paid
like any other of its calls. With a `schema` the answer is an object of that shape:

```ts
const { object } = await server.generate({
  model: "classifier",
  system: "You sort support mails.",
  prompt: `Which team does this mail go to?\n\n${mail}`,
  schema: z.object({ team: z.enum(["sales", "support", "billing"]) }),
});
```

| Field | | Default |
|---|---|---|
| `prompt` | What the model is asked | required |
| `system` | How it should answer | |
| `schema` | A zod schema: `object` is the answer in that shape | text only |
| `model` | `classifier` (fast, cheap), `standard`, `high`, `highest` | `standard` |
| `maxOutputTokens` | A limit on the answer | the model's |
| `signal` | Aborts the call | two minutes |

It answers `{ text, object }`. Without a model set up it throws an error with the status `503`
and the code `no_model`: a route that lets it through answers just that, and the studio half
says it in the person's language.

## Jobs

```ts
server.every("refresh", 60 * 60_000, async ({ tenantId, lastRun, signal }) => {
  for (const source of await dueSources()) {
    await refresh(source, signal);
  }
});
```

- The handler runs for every tenant that has the plugin, inside that tenant, at most once per
  `everyMs`. A minute is the least.
- When it ran is kept: a restart does not start the count again. A runtime that was off runs a
  due job once when it starts, not once per turn it missed. A local install runs jobs while it
  runs.
- One turn per tenant at a time. A turn that throws is logged and counts as run.
- `lastRun` is when the turn before started; `null` the first time. `signal` is aborted
  when the plugin unloads.
- `PLUGIN_JOBS=0` keeps a runtime from running jobs, for one whose jobs another process runs.

## The web

```ts
const page = await server.web.read("https://example.com/preise");
// { url, status, etag, lastModified, title, description, text, links }

const res = await server.web.fetch(`${origin}/sitemap.xml`, {
  headers: { "if-none-match": source.etag ?? "" },
});
```

- Both refuse addresses of this machine and of the local network, after a redirect too, as the
  runtime's own requests do.
- `read` gives the page's text as Markdown and every link, absolute and each once. A page with
  hardly any text without its scripts is drawn in a browser first. `etag` and
  `lastModified` are what the server sent, for asking later whether the page changed.
- `fetch` is `fetch` behind the guard: for a sitemap, `robots.txt`, a question with
  `if-none-match`.

## Documents

```ts
const { markdown, pages } = await server.documents.parse({ data, name: "preise.pdf", mime });
```

PDF and Word files by their own text, scans and photos by a vision model, spreadsheets and CSV as
tables. What was read is kept by content: the same bytes are read, and paid for, once.

## Undo on unload

A plugin can load again while the runtime runs. What it registered through `wizards.server` is
taken back for it. Anything else it started, it undoes itself:

```ts
const timer = setInterval(sync, 60_000);
server.onUnload(() => clearInterval(timer));
```

The functions run last-first when the plugin unloads or loads again.

## When loading fails

A plugin whose function throws keeps nothing of what it registered before the error: no half
plugins. Settings → Plugins shows the error, and the plugin's routes answer `404` until its file
is mended.

## Imports

`@engenty-wizards/plugin-sdk`, `zod`, `drizzle-orm` and `drizzle-orm/sqlite-core` come from the
runtime's own copies, so a schema or a table a plugin makes is one the runtime understands. See
[Files and manifest](./layout.md#dependencies) for everything else.
