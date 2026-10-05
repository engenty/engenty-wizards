# Modules

Plugins that ship with engenty wizards: every runtime loads what is in this folder, in a
checkout, in the npm package and in the Docker image. Each is a folder with an
`engenty.plugin.json`, as [docs/plugins.md](../docs/plugins.md) describes.

A module here is part of the open product. A plugin that is not goes into a folder of
`PLUGINS_DIR` instead.

- A module's server half may import what the runtime hands every plugin (the plugin SDK, `zod`,
  `drizzle-orm`) and its own files. It has no `node_modules` of its own where it is installed.
- A module with a studio half is a workspace package whose `build` script is
  `node ../../scripts/build-plugin.mjs .`, so `pnpm build` builds its `dist/`.
  `apps/runtime/Dockerfile` copies each workspace package's `package.json` before it installs:
  add the module's there.
