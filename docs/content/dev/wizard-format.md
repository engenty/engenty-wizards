---
title: The wizard format
description: A wizard as JSON and as a .wizard file, its JSON Schema, and checking it with wizards validate.
---

A wizard is one JSON document, its **definition**. The studio exports it as a `.wizard` file,
and imports one back. Both can be written by hand or by a tool, checked in your editor against a
JSON Schema, and checked completely with `wizards validate`.

## The definition

```json
{
  "$schema": "https://engenty.ai/docs/schema/wizard/1.json",
  "version": 1,
  "title": "Rechnung erstellen",
  "description": "Aus ein paar Angaben wird eine fertige Rechnung.",
  "avatar": "round",
  "steps": [ … ]
}
```

`steps` run top to bottom, and the last one is always a `result` step. The step types and their
fields are in the schema below. The studio's MCP tool `get_authoring_guide` explains them with a
complete example.

`version` is the definition's version. It changes only with a breaking change; the schema of
each version stays online under its number.

## The `.wizard` file

A zip with two things in it:

| Path | What it holds |
|---|---|
| `wizard.json` | The manifest: the definition, plus what it needs from its project |
| `files/…` | The wizard's workspace: widget pages, templates, images. At most 200 files and 25 MB |

```json
{
  "$schema": "https://engenty.ai/docs/schema/wizard-package/1.json",
  "format": "engenty-wizard",
  "version": 1,
  "definition": { … },
  "connectors": [{ "id": "billomat", "name": "Billomat", "domain": "billomat.com" }],
  "mcpServers": [{ "id": "notion", "name": "Notion" }]
}
```

`connectors` and `mcpServers` name what the wizard's steps use from its project, without
addresses or credentials. A project that lacks one is told so on import.

The import also takes a `wizard.json` on its own, or a definition on its own.
The file's media type is `application/vnd.engenty.wizard+zip`.

## JSON Schema

| For | Schema |
|---|---|
| A definition | [`https://engenty.ai/docs/schema/wizard/1.json`](https://engenty.ai/docs/schema/wizard/1.json) |
| `wizard.json` in a package | [`https://engenty.ai/docs/schema/wizard-package/1.json`](https://engenty.ai/docs/schema/wizard-package/1.json) |

Put the address under `"$schema"`, and editors such as VS Code complete keys and mark mistakes
as you type. The studio's export writes it into every `wizard.json`.

The schemas are written from the code that reads wizards, so they match it. They are stricter
in one way: a key the app does not know is an error. The app would drop such a key without a
word.

What a JSON Schema cannot say is left to `wizards validate`: unique ids, steps and fields that
refer to each other, templates naming answers that exist by then, and files in the workspace.

## `wizards validate`

```bash
wizards validate invoice.wizard
```

It checks a wizard the way the studio's import does, with no running studio and no account.
It takes any number of paths:

| Path | Read as |
|---|---|
| `invoice.wizard` | A package |
| `invoice/` or `invoice/wizard.json` | An unpacked package, its workspace under `invoice/files/` |
| `invoice.json` | A definition on its own, or a `wizard.json` |

```text
✗ invoice.json 2 issues
  The last step must be a result step.
  "{{nope}}" refers to a field that is not asked before "g".
```

`--json` prints the issues as JSON. The exit code is `0` when every wizard is fine, `1` when one
has issues and `2` when no path was given. That is enough for a check in CI:

```bash
npx wizards validate wizards/*.wizard
```

The project's own things are checked on import, because only a project has them: its
connectors and their actions, its MCP servers and its plugins' tools.
