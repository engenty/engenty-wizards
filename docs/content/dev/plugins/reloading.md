---
title: While it runs
description: Save a file and the plugin loads again — what reloads, what survives, and how to work on a plugin.
---

A runtime that runs alone watches its plugins. You do not restart it while you write one.

## What happens on a change

| You change | What happens |
|---|---|
| A file of the server half | The plugin loads again: what it registered goes, its `onUnload` functions run, its files are read anew |
| `dist/client.js`, `dist/client.css` | The open studio takes the new files in place. A page of the plugin that is open stays open |
| A file below `ui/` | Nothing, until it is built: the change counts once `dist/` changes |
| A new file or folder in a plugins folder | The runtime looks again: new plugins load, the others stay as they are |
| A plugin's file or folder is removed | That plugin unloads. Its tables stay |
| A new `.sql` file | Runs on the open tenant databases with the reload |
| An npm dependency of the plugin | Needs a restart: Node keeps a package once it was imported |
| The manifest's `id` | The plugin is gone under the old id and new under the new one |

A reload takes about as long as reading the files: well under a second.

## What survives a reload

| | |
|---|---|
| Rows in the plugin's tables | Stay |
| Variables of the module | Start again |
| A step that is running | Keeps the tools it started with |
| Timers, sockets, watchers | Are yours to stop: `server.onUnload`, `studio.onUnload` |
| A plugin page open in the studio | Stays open, drawn by the new code |

## A plugin that breaks

A plugin that fails when it loads again is out until its file is mended: its tools are gone and
its routes answer `404`. Settings → Plugins shows the error. Save a mended file and it is back.

## By hand

Settings → Plugins, for owners and admins of a runtime that runs alone:

| Button | Does |
|---|---|
| Reload, on a plugin | Loads that plugin again |
| Look again | Loads every plugin again, finds new ones, drops missing ones |

`PLUGINS_WATCH=0` in the install's `.env` turns the watching off; the buttons still work.

## Working on a plugin

A loop that needs no restart, from a checkout:

1. Put the plugin's folder somewhere and name its parent in `PLUGINS_DIR` (`.env.local`).
2. Start the app:

   ```bash
   pnpm dev
   ```

3. In a second terminal, build the studio half on every save:

   ```bash
   node scripts/build-plugin.mjs <plugin folder> --watch
   ```

4. Open the plugin's page in the studio and edit. The server half reloads on save; the page
   updates when the build finished.

The runtime's log names the plugins it loaded at start (`plugins: contacts, workdays`) and
prints why one did not load.

## A runtime of a Manage-App

Nothing reloads there: a reload would hit every tenant at once. A new version of a plugin comes
with a new start of the runtime. See [Shipping](./shipping.md).
