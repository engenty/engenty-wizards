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
| `registerHttpRoute(route)` | A route below `/api/studio/plugins/<id>` | [Routes](./routes.md) |
| `registerMigrations(folder)` | `.sql` files with the plugin's tables | [Tables](./tables.md) |
| `on(event, listener)` | Called when a run ends | [Run events](./events.md) |
| `getTenantDb()` | The database of the tenant the current request, step or event belongs to | [Tables](./tables.md) |
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
