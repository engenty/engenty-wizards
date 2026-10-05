---
title: Plugins
description: Add pages, settings and tools for steps to your install. What a plugin may do, and how to install one.
---

A plugin adds to engenty wizards without changing it:

| It can add | You find it |
|---|---|
| Tools for AI steps | In a step's tool list, beside the built-in ones |
| A page | Behind an icon in the studio's top bar |
| A settings section | In the settings |
| Something that happens when a run ends | Nowhere: it works in the background, for example posts a message |

> A plugin runs with the app's full rights: it reads your wizards, your results, your settings
> and the files of your computer. Install only what you know.

## Install one

A plugin is a file or a folder. Put it into the plugins folder of your install:

```bash
~/.engenty/wizards/plugins
```

- The app sees a new plugin while it runs; no restart.
- A plugin's own instructions say which settings it needs. They go into the install's
  [settings file](./command-line.md#settings).
- Another folder: `PLUGINS_DIR` in the settings file names one or several, comma-separated.

## See what is installed

Settings → Plugins lists the plugins with their version and the tools they add. The section
appears once a plugin is there.

| Button | Does |
|---|---|
| Reload | Loads one plugin again from its files |
| Look again | Loads all plugins again and finds new ones |

- "The server half did not load" or "The studio half did not load" names what went wrong with a
  plugin. It adds nothing until that is mended.
- "Not a plugin" lists files in the plugins folder that look like a plugin and are none.

## Remove one

Delete its file or folder. Tables a plugin made in your database stay, with their rows.

## Wizards that use a plugin's tool

A wizard that lists a plugin's tool runs only where that plugin is installed. Elsewhere the
editor shows an issue, and a run stops at that step. Keep that in mind when you export a wizard
or publish it to the cloud.

## On engenty.ai

Plugins are installed by the service. The settings list the ones switched on for your account.

## Write your own

See the [developer docs](../dev/plugins/index.md).
