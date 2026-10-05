# Plugins

A plugin adds to a runtime without changing its code: tools for agent steps, routes with tables
of their own, something to do when a run ends, pages in the studio, sections in its settings.
The runtime finds plugins at start, loads them from their files and can load one again while it
runs.

A plugin runs inside the runtime's process with all of its rights: it reads every tenant's
data, the install's settings and the files of the machine. Install only code you know. The
"Claude Code plugin" (`plugin/`, `apps/runtime/src/plugin.ts`) is something else: the plugin
this server hands to Claude Code.

## Two halves

| | Server half | Studio half |
|---|---|---|
| File | `src/plugin.ts`, or the one file a small plugin is | `ui/plugin.tsx`, built to `dist/client.js` and `dist/client.css` |
| Runs in | the runtime | the studio, after sign-in |
| Loaded | as TypeScript, no build | as the built script |
| Types | `@engenty-wizards/plugin-sdk` | `@engenty-wizards/plugin-sdk/studio` |
| Adds | routes, tools, tables, listeners on runs | pages, icons in the top bar, sections of the settings |

A plugin may have one half or both.

## Where the runtime looks

| Folder | What is in it |
|---|---|
| `modules/` of the runtime | plugins that ship with engenty wizards ([modules/README.md](../modules/README.md)) |
| each folder of `PLUGINS_DIR` (comma-separated) | plugins of this install |

A local install looks in `~/.engenty/wizards/plugins` unless its `.env` names another folder. A
runtime that watches its plugins makes a folder of `PLUGINS_DIR` that is missing.
From a checkout `PLUGINS_DIR` is empty: `PLUGINS_DIR=examples/plugins` in `.env.local` loads the
examples.

In such a folder:

| Entry | Is |
|---|---|
| `notify.ts`, `notify.js` | a plugin of one file; its id is the file's name |
| `contacts/engenty.plugin.json` | a plugin with a manifest |
| `hello/index.ts` | a plugin without one; its id is the folder's name |
| `node_modules/<package>`, `node_modules/@scope/<package>` | installed packages that carry a manifest |

Names that begin with `.` or `_` are skipped. Of two plugins with one id the first found stays;
the other shows as a problem in the settings.

## The manifest

`engenty.plugin.json` is the file an engenty module has; fields this runtime does not know are
kept.

```json
{
  "id": "contacts",
  "name": "Contacts",
  "version": "0.1.0",
  "description": "People who used a wizard.",
  "provides": ["module.contacts"]
}
```

| Field | |
|---|---|
| `id` | lower case, digits and `-`, starting with a letter. Part of the plugin's addresses and of its tools' ids |
| `name`, `version`, `description` | shown in the settings |
| `server` | the server half, default `src/plugin.ts` (then `src/plugin.js`, `dist/plugin.js`) |
| `studio`, `styles` | the built studio half, default `dist/client.js` and `dist/client.css` |

## The server half

The default export is a function. It gets `wizards` and registers what the plugin adds.

```ts
import { definePlugin } from "@engenty-wizards/plugin-sdk";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { contact } from "./schema";

export default definePlugin((wizards) => {
  const { server } = wizards;

  server.registerMigrations("migrations");

  // GET /api/studio/plugins/contacts/
  server.registerHttpRoute({
    method: "GET",
    path: "/",
    handler: async () => ({ contacts: await server.getTenantDb().select().from(contact) }),
  });

  // An agent step lists it as "contacts.lookup".
  server.registerTool({
    name: "lookup",
    description: "Find a contact of this project by e-mail.",
    inputSchema: z.object({ email: z.string().email() }),
    execute: async ({ email }) => {
      const [row] = await server.getTenantDb().select().from(contact).where(eq(contact.email, email));
      return row ?? { found: false };
    },
  });

  server.on("run.done", async ({ run, values }) => {
    if (run.mode === "live" && typeof values.email === "string") {
      await server.getTenantDb().insert(contact).values({ email: values.email }).onConflictDoNothing();
    }
  });
});
```

| Call | Does |
|---|---|
| `server.registerHttpRoute({ method, path, role?, handler })` | A route below `/api/studio/plugins/<id>`: signed in, inside the person's tenant. `path` takes `:name` parts. `role: "admin"` lets only owners and admins in. The handler answers with a value (sent as JSON) or a `Response` |
| `server.registerTool({ name, title?, description, inputSchema, execute })` | A tool for agent steps, listed in a step's `tools` as `<id>.<name>`. The model sees it as `<id>_<name>` |
| `server.registerMigrations(folder)` | `.sql` files with the plugin's tables, see below |
| `server.on("run.done" \| "run.failed" \| "run.cancelled", listener)` | Called when a run reached its end, inside the run's tenant, with the run, its wizard and what the person answered. A listener that throws is logged; it cannot fail the run. A run that is redone and ends again is told again |
| `server.getTenantDb()` | The database of the tenant the current request, step or event belongs to (Drizzle, libSQL) |
| `server.onUnload(fn)` | Something to undo when the plugin unloads: a timer, a socket |
| `wizards.config.get(key)` | A setting of the install (its `.env`) |
| `wizards.log`, `wizards.resolvePath(relative)`, `wizards.plugin` | A log line with the plugin's name, a file of the plugin, its manifest |

- **Imports**: `@engenty-wizards/plugin-sdk`, `zod`, `drizzle-orm` and `drizzle-orm/sqlite-core`
  come from the runtime's own copies, wherever the plugin's file is. Anything else a plugin
  brings itself, in a `node_modules` beside it.
- **Errors**: an error thrown in a route with a `status` and a `code`
  (`Object.assign(new Error("…"), { status: 422, code: "no_text" })`) goes out as
  `{ error, code }` with that status. Anything else is logged and answered with `500`
  `plugin_failed`. Send a `code`, not a sentence: the studio half says it in the person's
  language.
- **A plugin that fails while loading** keeps nothing of what it registered; the settings say
  why.

### Tables

Every tenant has its own database, so a plugin's tables are made in each of them.

- Each `.sql` file of the registered folder runs once per tenant database, in the order of the
  file names (`0001_init.sql`, `0002_note.sql`). A file and its record go in together or not at
  all; `plugin_migration` holds which ran.
- A database gets the files when it opens; the open ones get them when the plugin loads.
- Begin table names with the plugin's id (`contacts_person`): all plugins and the runtime share
  the database.
- Nothing is taken back. Unloading or removing a plugin leaves its tables and rows.

### Tools in a wizard

A step lists a plugin's tool by its full id: `"tools": ["web_search", "contacts.lookup"]`.

- The editor offers the tools of the tenant's plugins beside the built-in ones; the architect
  and the MCP authoring guide list them.
- A draft that names a tool this tenant does not have shows an issue.
- A run fails at the step that names one: a wizard that uses a plugin's tool runs only where
  that plugin is installed.

## The studio half

```tsx
import { defineStudioPlugin } from "@engenty-wizards/plugin-sdk/studio";
import { Card, Empty } from "@engenty-wizards/web/ui";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";

const messages = {
  de: { title: "Kontakte", empty: "Noch keine Kontakte." },
  en: { title: "Contacts", empty: "No contacts yet." },
};

export default defineStudioPlugin((studio) => {
  const t = studio.i18n.register(messages);

  function ContactsPage() {
    const list = useQuery({ queryKey: ["contacts"], queryFn: () => studio.api.get<{ contacts: { email: string }[] }>("/") });
    if (!list.data?.contacts.length) {
      return <Empty>{t("empty")}</Empty>;
    }
    return list.data.contacts.map((c) => (
      <Card key={c.email} className="px-5 py-3 text-ink-2">
        {c.email}
      </Card>
    ));
  }

  studio.registerPage({ path: "/contacts", component: ContactsPage });
  studio.registerNav({ to: "/contacts", label: () => t("title"), icon: Users });
});
```

| Call | Does |
|---|---|
| `studio.registerPage({ path, component, wide? })` | A page of the studio, inside its frame. The studio's own addresses (`/new`, `/edit`, `/settings`, `/setup`) are taken |
| `studio.registerNav({ to, label, icon })` | An icon in the top bar that opens a page |
| `studio.registerSettingsSection({ id, label, icon, component, menu? })` | A section at `/settings/<id>` |
| `studio.i18n.register(messages)` | Takes `{ de, en }` and gives `t(key, vars?)` in the language in effect. `de` is the source. Labels are functions, since the language can change while the studio is open |
| `studio.api.get \| post \| put \| patch \| del(path, body?)` | The plugin's own routes |
| `studio.me()`, `studio.onUnload(fn)` | The signed-in person; something to undo when the plugin reloads |

### Building it

```bash
node scripts/build-plugin.mjs <plugin folder>           # dist/client.js, dist/client.css
node scripts/build-plugin.mjs <plugin folder> --watch
```

The build needs a checkout of this repo: it uses the studio's own tools (Vite, Tailwind). A
plugin with a studio half is a folder with a manifest.

- **One React.** `react`, `react/jsx-runtime`, `react-dom`, `react-router`,
  `@tanstack/react-query`, `@engenty-wizards/web/ui` (the studio's components) and
  `@engenty-wizards/plugin-sdk/studio` are not in `client.js`: the script takes them from the
  studio that loads it. Of the router it gets `Link`, `NavLink`, `Navigate`, `useNavigate`,
  `useParams`, `useLocation`, `useSearchParams`; of the query cache `useQuery`, `useMutation`,
  `useQueryClient`. Everything else a plugin imports is bundled; a package its folder lacks
  (`lucide-react`) comes from the studio's.
- **Styles.** `client.css` holds the Tailwind utilities the plugin's files use, built against
  the studio's theme by reference: the names (`bg-paper-2`, `text-ink-3`, `dark:`, `coarse:`),
  none of the variables or resets. Every rule applies only inside what the plugin draws
  (`[data-plugin="<id>"]`) and sits in a layer above the studio's utilities, so a plugin's
  stylesheet never changes how the studio looks.
- **The theme is a contract.** The names in `apps/web/src/styles/theme.css` are what plugins are
  built against. Renaming or removing one breaks plugins built before, without an error.
- **Colours come from the tokens.** Dark is derived per wizard, not a fixed palette: a literal
  colour in a plugin breaks on it.
- **Own CSS.** A stylesheet imported in `ui/plugin.tsx` lands in `client.css` as it is. Begin
  its class names with the plugin's id.

## While the runtime runs

| Change | What happens |
|---|---|
| A file of the server half | The plugin loads again: what it registered goes, `onUnload` runs, its files are read anew. A step that is running keeps the tools it started with |
| `dist/client.js`, `dist/client.css` | The open studio takes the new files in place; an open page of the plugin stays open |
| A new file or folder in a plugins folder, or one removed | The runtime looks again: new plugins load, missing ones unload, the others stay as they are |
| A new `.sql` file | Runs on the open tenant databases with the reload |
| A changed npm dependency of a plugin | Needs a restart: Node keeps a package once it was imported |

- The runtime watches its plugins where it runs alone (`PLUGINS_WATCH=0` turns that off).
- Settings → Plugins lists the plugins and what failed. It loads one again by hand, or all of
  them.
- A plugin that breaks on reload is out until its file is mended: its routes answer `404`.

## A runtime of a Manage-App

- Plugins are installed by whoever runs the runtime, into the image or a folder of
  `PLUGINS_DIR`. A tenant cannot install one.
- A tenant has the plugins in `PLUGINS_DEFAULT` (comma-separated ids) and the ones the Manage-App
  lists for it: `modules` in `GET /v1/tenants/:id` ([manage-contract.md](manage-contract.md)).
  Routes, tools, listeners and the studio half of any other plugin do not exist for that tenant.
- Nothing reloads: a reload would hit every tenant. A new version comes with a new start.

## Not there yet

- Connectors, tools for MCP clients, AI clients and starters from a plugin.
- New kinds of steps or fields: the public pages of a wizard load no plugin.
- Building a studio half without a checkout.

## Examples

| | |
|---|---|
| [`examples/plugins/notify.ts`](../examples/plugins/notify.ts) | one file: posts a line when a shared wizard was run to its end |
| [`examples/plugins/run-log/`](../examples/plugins/run-log) | both halves: a table, a listener, two routes, a tool, a page, a settings section |

`apps/runtime/test/plugins.test.ts` exercises loading, routes, tools, tables per tenant and
reloading; `managed.test.ts` which tenant has which plugin.
