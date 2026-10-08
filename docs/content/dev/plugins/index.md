---
title: Plugins
description: What a plugin is, what its two halves can add, and what it may touch.
---

A plugin adds to a runtime without changing its code. The runtime finds plugins at start, loads
them from their files and loads one again when its files change.

## What a plugin can add

| It adds | Where it shows | Page |
|---|---|---|
| A tool for AI steps | In a step's tool list, in the assistant's and the MCP authoring guide | [Tools](./tools.md) |
| A block and tools for every AI step of a space | In the steps' instructions | [The space](./space.md) |
| Pages, tables and files of a space's Wissen, with Kategorien | In Wissen, and in what `project_search` finds | [The space](./space.md#wissen-a-plugin-writes) |
| Texts in a space's search index | In what `project_search` finds | [The space](./space.md#the-search-index) |
| Tools of the space assistant, and their cards | In the chat on the space page | [The space](./space.md#tools-of-the-space-assistant) |
| Routes | Below `/api/studio/plugins/<id>`; public ones below `/api/public/plugins/<id>` | [Routes](./routes.md) |
| Tables | In every tenant's database | [Tables](./tables.md) |
| A listener on runs that end and spaces that change | Nowhere: it works in the background | [Events](./events.md) |
| A job, again and again | Nowhere: it works in the background | [The server half](./server.md#jobs) |
| An account of a space (a calendar, a mailbox), signed in through a built-in connector | Where the plugin's own pages offer it | [Accounts](./connections.md) |
| A wizard as a template | First among the templates of a new wizard, and in the MCP `list_starters` | [Starters](./starters.md) |
| A page of the studio | Behind an icon in the top bar, or at its address | [The studio half](./studio.md) |
| A section of the settings | In the settings' list | [The studio half](./studio.md) |
| A section of the space page | In one of its parts, below the part's own sections | [The studio half](./studio.md#the-space) |

## Two halves

| | Server half | Studio half |
|---|---|---|
| File | `src/plugin.ts`, or the one file a small plugin is | `ui/plugin.tsx`, built to `dist/client.js` and `dist/client.css` |
| Runs in | The runtime | The studio, after sign-in |
| Loaded | As TypeScript, no build | As the built script |
| Types | `@engenty-wizards/plugin-sdk` | `@engenty-wizards/plugin-sdk/studio` |
| Adds | Tools, routes, tables, listeners, jobs, starters, Wissen, the space's block, index and assistant tools | Pages, icons in the top bar, sections of the settings and of the space page, cards in the assistant's chat |

A plugin has one half or both. The studio half talks to the server half over the plugin's own
routes.

```mermaid
flowchart LR
  page["Studio half, in the browser<br/>ui/plugin.tsx<br/>pages, top bar, settings"]
  runner["The runtime's step runner"]
  server["Server half, in the runtime<br/>src/plugin.ts<br/>tools, routes, listeners"]
  db[("Tenant database<br/>the plugin's tables")]
  page -- "the plugin's routes" --> server
  runner -- "calls a tool, says a run ended" --> server
  server --> db
```

## What a plugin may touch

A plugin runs inside the runtime's process with all of its rights. It reads every tenant's data,
the install's settings and the files of the machine. There is no sandbox and no permission list.

- Install only code you know.
- A plugin for others says in its own description what it reads and where it sends it.

## Not the Claude Code plugin

The "Claude Code plugin" of engenty wizards is something else: what a runtime hands to Claude
Code (`plugin/` in the repository). These pages are about plugins of the runtime.

## Not there yet

- Connectors of its own, tools for MCP clients and AI clients from a plugin. A plugin connects
  accounts through the built-in connectors: [Accounts](./connections.md).
- New kinds of steps or fields: the public pages of a wizard load no plugin.
- Building a studio half without a checkout of the repository.
