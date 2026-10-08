---
title: Starters
description: Wizards a plugin brings as templates — how to register one, where it shows, and what a wizard made from it gets.
---

A starter is a wizard a plugin brings as a template. It stands beside the marketplace's starters
wherever a wizard is made, for the tenants that have the plugin.

```ts
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(wizards.resolvePath(path), "utf8");

server.registerStarter({
  id: "book",
  title: "Termin buchen",
  description: "Fragt nach Anliegen und Wunschzeit und bucht einen freien Termin.",
  definition: JSON.parse(read("starters/book.json")),
  files: { "widget/slots.html": read("starters/slots.html") },
});
```

| Field | |
|---|---|
| `id` | Lower case, digits and `-`, starting with a letter, at most 40 characters. Unique in the plugin |
| `title` | What the list of templates calls it |
| `description` | What it makes, in one or two sentences. Shown under the title |
| `language` | `"de"` or `"en"`, the language its texts are in. Default: `"de"` |
| `definition` | A complete wizard definition: the JSON the studio keeps and `get_authoring_guide` describes |
| `files` | Files of the wizard's workspace by path: widgets, sample data. A string is written as UTF-8, a `Uint8Array` as it is |

## Checked when it is registered

The definition is read as a wizard when `registerStarter` is called. A starter that is no wizard,
an id that is not allowed and an id registered twice throw, and the plugin does not load; the
error names the starter:

```
Starter "book": steps.2.fields: …
```

## Where it shows

The starter is known as `<plugin id>.<starter id>`: `appointments.book`. A marketplace entry's id
has no dot, so the two never meet.

| Where | |
|---|---|
| New wizard in the studio | First among the templates, with the plugin's name on its card. It cannot be starred: it is always there, also without a connection |
| `GET /api/studio/marketplace` | First on the first page, with `plugin: { id, name }` |
| MCP `list_starters`, `get_starter`, `create_wizard` | Listed first with `plugin`; `starterId` takes its id |

Only the tenants that have the plugin see it, by the same rule as its tools
([Which tenant has a plugin](./shipping.md#which-tenant-has-a-plugin)). Words and filters of a search find it by its title, its description
and the plugin's name.

## A wizard made from it

- gets a copy of the definition and the files; later changes of the starter do not reach it.
- keeps the starter's id in `starter`. `starterRevision` stays empty: the starter changes with
  the plugin's version, not with a revision of its own.
- is not counted at the marketplace.
