# Auto-update of the installed `wizards`

Like Claude Code: an install keeps itself current in the background, switches only when nothing
runs, and can be turned off. Runs spend credits, so an update never cuts one off.

## What the first version does

- **Scope.** Only an install made by install.sh (`~/.engenty/wizards`). `npx wizards` and a
  checkout never update themselves.
- **Layout.** `runtime/<version>/` (an npm prefix each), `runtime/current` → the one that runs,
  `runtime/node_modules` → `current/node_modules` for commands written before (an older
  `bin/wizards` or `npx wizards`). An install from before (runtime/ as the prefix) moves into its
  version folder at its first switch. Code: `apps/runtime/src/cli/versions.ts`.
- **Check and install.** The runtime asks the npm registry (`wizards/latest`) soon after it
  starts (at most once an hour) and once a day. A newer version is installed by npm, which checks
  it against the registry's integrity hash, into a folder of its own that becomes `runtime/<v>/`;
  `update.json` notes it as pending. This needs the release workflow to keep publishing to npm
  (`PUBLISH_NPM`); install.sh and `wizards update` still take the GitHub release's tarball.
  Code: `apps/runtime/src/cli/autoupdate.ts`.
- **Switch.** Only `wizards start` switches, before it starts a runtime: at a restart or the next
  login, never while a runtime (and so a run) is up. It then replaces itself with the new
  version's `start` (`process.execve`, same pid for the login item).
- **Keep.** The current, the pending and the previous version stay; older ones go.
- **Notice.** `wizards status` and the studio banner say "Updated to X" with what changed (two
  weeks), or that X is downloaded and runs from the next start.
- **Off.** `wizards autoupdate off`, or `WIZARDS_DISABLE_AUTOUPDATE=1` in the terminal or the
  install's `.env` (wins over everything). Off by default in CI (`CI`) and for an install set up
  without a terminal; `wizards autoupdate on` turns it on there.
- **Uninstall** removes the whole `runtime/` folder, so every version goes with it.

## Later steps

1. **Switch while idle.** The runtime itself restarts into a pending version when no run is
   active (none running or waiting on a person) and nobody used the studio for a while, e.g. at
   night. Needs an "active runs" query in the runner and a quiet period, then `RESTART_EXIT`. The
   studio's "Update" button should wait the same way instead of restarting at once.
2. **Rollback.** `wizards update --rollback` points `current` at `updated.from` (it is kept) and
   restarts. Automatic: after a switch, `start` waits for `/api/health`; if the new version does not
   answer within a minute or exits early twice, it switches back, notes the failed version in
   `update.json` (never retried automatically) and says so in the status.
3. **Back up control.db before database changes.** Before the first start of a new version that
   brings migrations, copy `data/control.db` (and the tenant databases) with SQLite's backup API
   to `data/backups/<from>-<at>/`; keep the last three. A rollback past a migration restores that
   backup (with a clear question, since newer data would be lost).
4. **Version checks between `wizards mcp` and the runtime.** A long-running `wizards mcp` (started
   by an AI app) may be older than the runtime after a switch. It sends its version in a header;
   the runtime answers with its own; on a mismatch the bridge keeps working where the protocol is
   compatible, and otherwise tells the AI app to restart it (MCP error with a clear message).
   Breaking bridge changes need a protocol version, not the package version.
5. **Stable or beta.** A channel setting (`wizards autoupdate --channel beta`, install.json):
   beta takes the newest release including pre-releases (`/releases` instead of
   `/releases/latest`), stable only full releases. Switching from beta to stable does not
   downgrade; it waits for a stable release newer than the installed one.
6. **Stronger signature.** npm's integrity hash comes from the registry as the package does;
   publishing with npm provenance and checking it (`npm audit signatures`) guards against a
   compromised publish too. install.sh could take the package from npm as well, so both use one
   source.
7. **Processes on an old version.** A long-running `wizards mcp` may still run from a version
   that pruning deletes (two updates without a restart of the AI app). It loads its code at
   start, so this is fine today; if not, pruning should skip versions a process still uses.
