---
title: Developer
description: Extend engenty wizards with plugins — tools for AI steps, routes with their own tables, pages in the studio.
---

engenty wizards is extended with **plugins**. A plugin adds to a runtime without changing its
code, and it loads from its files while the app runs.

## Start here

| | |
|---|---|
| [What a plugin is](./plugins/index.md) | The two halves, what each can add, what a plugin may touch |
| [Quick start](./plugins/quick-start.md) | A tool for AI steps in one file, working in two minutes |
| [Reference](./plugins/reference.md) | Every call, type, address and setting |
| [Examples](./plugins/examples.md) | Two plugins to read and copy |

## What you need

- An install of engenty wizards, or a checkout of
  [engenty/engenty-wizards](https://github.com/engenty/engenty-wizards).
- TypeScript. A plugin's server half is read as TypeScript, without a build.
- A checkout, if your plugin draws in the studio: its studio half is built with the studio's
  own tools.

## Working on engenty wizards itself

These pages are about extending it. The code's own documents are in the repository:

| | |
|---|---|
| [docs/development.md](https://github.com/engenty/engenty-wizards/blob/main/docs/development.md) | Run it from source, the checks, how it is built, releases |
| [docs/manage-contract.md](https://github.com/engenty/engenty-wizards/blob/main/docs/manage-contract.md) | What a runtime and a Manage-App speak |
| [docs/marketplace-contract.md](https://github.com/engenty/engenty-wizards/blob/main/docs/marketplace-contract.md) | What a runtime and the marketplace speak |
