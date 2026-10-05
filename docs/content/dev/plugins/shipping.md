---
title: Shipping
description: Hand a plugin to someone else, put it into a server's image, and decide which tenant has it.
---

## To someone's install

A plugin is a file or a folder. Whoever installs it puts it into their plugins folder:
`~/.engenty/wizards/plugins` for an installed app.

Give them:

| | |
|---|---|
| One file | `notify.ts` |
| A folder | The manifest, `src/`, `migrations/`, and the built `dist/`. Not `ui/`: it is the source of `dist/` |
| Dependencies | A `node_modules` beside the plugin, if it imports anything but the SDK, `zod` and `drizzle-orm` |
| Settings | The names of the `.env` lines it reads, in its description |

Say what it does with data: a plugin runs with the app's full rights, and the person who
installs it trusts you with them.

## As a package

Packages installed into a plugins folder count as plugins when they carry a manifest:

```bash
cd ~/.engenty/wizards/plugins
npm install @acme/wizards-contacts
```

The runtime finds `node_modules/@acme/wizards-contacts/engenty.plugin.json` at its next start,
or with "Look again" in Settings → Plugins. Put the manifest, the server half and the built
`dist/` into the package's `files`.

## Into a server

With Docker, mount a folder and name it:

```yaml
services:
  wizards:
    environment:
      PLUGINS_DIR: /plugins
    volumes:
      - ./plugins:/plugins
```

Or copy the plugins into an image of your own, built on the runtime's.

## With engenty wizards itself

Plugins in the repository's `modules/` folder ship with every runtime: in a checkout, in the
installed app and in the Docker image. A module there is part of the open product.

- Its server half imports only what the runtime hands every plugin and its own files. It has no
  `node_modules` of its own where it is installed.
- A module with a studio half is a workspace package whose `build` script is
  `node ../../scripts/build-plugin.mjs .`, so the product's build builds its `dist/`.

A plugin that is not part of the open product stays out of `modules/` and goes into a folder of
`PLUGINS_DIR`.

## Which tenant has a plugin

| The runtime runs | A tenant has |
|---|---|
| Alone: one person's install, your own server | Every plugin the runtime loaded |
| As the runtime of a Manage-App | The plugins in `PLUGINS_DEFAULT`, and the ones the Manage-App lists for that tenant |

In a runtime of a Manage-App:

- Plugins are installed by whoever runs the runtime, into the image or a folder of
  `PLUGINS_DIR`. A tenant cannot install one.
- `PLUGINS_DEFAULT` is a comma-separated list of ids every tenant has.
- The Manage-App switches further ones on per tenant: `modules` in its answer to
  `GET /v1/tenants/:id`
  ([manage-contract.md](https://github.com/engenty/engenty-wizards/blob/main/docs/manage-contract.md)).
- For a tenant without a plugin, that plugin does not exist: no routes, no tools, no listeners,
  no studio half.
- A plugin's tables are made in every tenant's database, whether the tenant has the plugin or
  not.
- Nothing reloads while it runs.

So one image serves tenants with different sets of plugins: the plugin is in the image, and the
Manage-App decides who has it.

## Versions

- `version` in the manifest is shown in the settings. The runtime does not compare versions.
- A plugin's `.sql` files only ever grow: an update adds files, it never changes one that ran.
- A wizard that uses a plugin's tool names it by id. Renaming a tool or the plugin breaks those
  wizards: keep ids for good.
