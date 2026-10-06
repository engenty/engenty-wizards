---
title: Examples
description: Two plugins in the repository to read, run and copy.
---

The repository has two example plugins. Load them from a checkout with one line in `.env.local`:

```bash
PLUGINS_DIR=examples/plugins
```

## notify: one file

[examples/plugins/notify.ts](https://github.com/engenty/engenty-wizards/blob/main/examples/plugins/notify.ts)
posts a line to an address whenever a real run of a wizard reached its end.

```ts
import type { WizardsPluginFactory } from "@engenty-wizards/plugin-sdk";

const plugin: WizardsPluginFactory = (wizards) => {
  const url = wizards.config.get("NOTIFY_URL");
  if (!url) {
    wizards.log.warn("NOTIFY_URL is not set: nothing will be sent.");
    return;
  }
  wizards.server.on("run.done", async ({ run, wizard }) => {
    if (run.mode !== "live") {
      return;
    }
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wizard: wizard.title, run: run.id }),
      signal: AbortSignal.timeout(10_000),
    });
  });
};

export default plugin;
```

| It shows | |
|---|---|
| A plugin of one file | Its id is the file's name |
| A setting | `NOTIFY_URL` in the install's `.env`, read at load time |
| A listener | Test runs left out, a time limit on the call |

## run-log: both halves

[examples/plugins/run-log](https://github.com/engenty/engenty-wizards/tree/main/examples/plugins/run-log)
keeps a line for every run that ended and shows them in the studio.

| File | Shows |
|---|---|
| `engenty.plugin.json` | A manifest |
| `migrations/0001_init.sql` | A table, `run_log_entry`, with an index |
| `migrations/0002_space.sql` | A column added later: the space of each line |
| `src/schema.ts` | The same table for Drizzle |
| `src/plugin.ts` | A listener on all three events, two routes (one for admins only, one that filters by space) and a tool, `run-log.recent` |
| `ui/messages.ts` | Words in German and English |
| `ui/plugin.tsx` | A page behind an icon of the top bar, a section of the settings that empties the log, and a section of the space page with the space's last runs |
| `package.json` | A workspace package whose `build` script builds the studio half |

Build its studio half once, or on every save:

```bash
node scripts/build-plugin.mjs examples/plugins/run-log
```

```bash
node scripts/build-plugin.mjs examples/plugins/run-log --watch
```

Then, in the studio:

1. The list icon in the top bar opens "Runs".
2. Test a wizard to its end. A line appears on the page.
3. Settings → Runs shows how many lines are kept and deletes them.
4. Space shows "Runs" below the space's own sections: the last five runs of its wizards.
5. An AI step can list the tool "Run log" and tell how the last runs ended.

## The plugin of these pages

The `contacts` plugin these pages build up, piece by piece:

| Piece | Page |
|---|---|
| The table `contacts_person` | [Tables](./tables.md) |
| The listener that keeps who ran a wizard | [Events](./events.md) |
| The routes that list and remove contacts | [Routes](./routes.md) |
| The tool `contacts.lookup` | [Tools](./tools.md) |
| The page and the settings section | [The studio half](./studio.md) |

## Tests to read

[apps/runtime/test/plugins.test.ts](https://github.com/engenty/engenty-wizards/blob/main/apps/runtime/test/plugins.test.ts)
writes small plugins into a folder and exercises them: finding, loading, a plugin that fails,
routes, tables per tenant, tools in a run, events, reloading. `managed.test.ts` beside it covers
which tenant has which plugin.
