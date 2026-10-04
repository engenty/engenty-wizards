# engenty wizards — desktop app

A [Tauri 2](https://v2.tauri.app) app (macOS first): one window on a server. The server is the
local install in `~/.engenty/wizards` — the same one the `engenty-wizards` command uses — or a
remote one. The app brings no runtime along: it holds a window, a menu-bar icon and the
installer, and is a few megabytes. Nothing in `apps/runtime/`, `apps/web/` or `packages/shared/`
is specific to the desktop app.

```
apps/desktop/
├── ui/                      the app's own page: splash, install progress, server choice, error
├── src-tauri/
│   ├── src/                 lib.rs (start, quit, deep links) · sidecar.rs (the local runtime:
│   │                        install, start, show one that already runs)
│   │                        window.rs (what the window may load; links, popups, downloads)
│   │                        commands.rs · menu.rs · environment.rs · state.rs · bridge.js
│   ├── capabilities/        shell.json — commands of the app's own page
│   ├── sidecar/watchdog.mjs ends the runtime if the app is killed
│   ├── entitlements.plist   hardened-runtime entitlements (camera, mic, location)
│   └── Info.plist           usage texts (camera, microphone, location), merged into the bundle
└── package.json             workspace package: `@tauri-apps/cli` only
```

Two resources go into the bundle: `watchdog.mjs` and the installer, `apps/web/public/wizards.sh`.

## Build and run

Node ≥ 24.11, pnpm, Rust (stable), Xcode command line tools.

```bash
pnpm install                         # repo root, once (the Tauri CLI comes with it)
cd apps/desktop
pnpm tauri build --debug --bundles app   # → src-tauri/target/debug/bundle/macos/engenty wizards.app
CI=true pnpm tauri build                 # release: …/release/bundle/macos/*.app and …/dmg/*.dmg
pnpm tauri dev                           # run from source
node ../../scripts/desktop-archive.mjs   # release app as dist/desktop/engenty-wizards-<version>-mac-<arch>.tar.gz + .sha256
```

`CI=true` keeps the dmg step from scripting Finder to lay out the disk image window. Start a
built app with `open "src-tauri/target/release/bundle/macos/engenty wizards.app"`.

To run the app against the checkout instead of an install — no installer, no update:

```bash
pnpm build                                            # repo root: the runtime the app will start
ENGENTY_WIZARDS_RUNTIME=$PWD pnpm --dir apps/desktop tauri dev
```

The app version is the root `package.json` version.

## How it gets onto a Mac

Not as a download from a web page: the build is not signed with a Developer ID (below), and
macOS blocks such an app when a browser fetched it. The setup and `engenty-wizards app` fetch
the archive from the GitHub release `v<version>` themselves, check it against its `.sha256`,
verify the bundle's signature and copy it to `/Applications` (`~/Applications` when that is not
writable). A file fetched that way carries no `com.apple.quarantine` attribute, so Gatekeeper
does not assess it; the ad-hoc signature is what Apple silicon asks for.
`apps/runtime/src/cli/desktop.ts` does this; `ENGENTY_WIZARDS_APP` names another archive (a path
or an address), `ENGENTY_WIZARDS_APP_DIR` another folder.

## What the app does

**Start, with "this Mac".** The app looks for the install: the package in
`~/.engenty/wizards/runtime/node_modules/engenty-wizards` and the Node in
`~/.engenty/wizards/tools/node`. If there is none, or its version is older than the app's, it
runs the installer it carries — `bash wizards.sh --no-setup --version <app version>` — and shows
its lines in the window. That needs the network once and takes a minute or two (about 800 MB on disk).

Then it picks a free loopback port — 24368, the port the command line uses too, else the one of
the last start when it is still free (kept in `data/desktop.port`), so links into the local
runtime and AI clients' MCP addresses outlive a restart — and a random access
key, resolves the PATH of the person's login shell once (a GUI app gets a minimal one; the
Studio chat runs the installed `claude`, widgets use `ffmpeg`), and starts
`node --import watchdog.mjs apps/runtime/dist/index.js` in `~/.engenty/wizards` with

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `API_HOST` / `API_PORT` | `127.0.0.1` / the port |
| `APP_URL` | `http://127.0.0.1:<port>` |
| `DATA_DIR` | `~/.engenty/wizards/data` |
| `LOCAL_ACCESS_KEY` | 24 random bytes, new at every start |
| `SECRETS` | `keychain` |
| `CHROME_PATH` | the installed Chrome, Edge, Chromium or Brave, if any |
| `PATH` | `~/.engenty/wizards/clients/bin`, the install's Node, then the login shell's |

The runtime inherits only a short list of other variables (`src/environment.rs`): home and
locale, proxy and certificate settings, `ACCOUNT_URL`, `ACCOUNT_GATEWAY_URL`, `CLOUD_URL`,
`OLLAMA_URL`, `FFMPEG_PATH`, `MODEL_*`. It never gets `MANAGE_URL`. More settings come from
`~/.engenty/wizards/.env`, which the runtime reads itself.

The window shows a splash until `GET /api/health` answers, then loads
`/api/local/enter?k=<key>`, which sets the studio's cookie and redirects to `/`.

**A runtime that already runs.** The command line and the app share one data folder, and two
runtimes must not write it. A running runtime leaves `running.json` there. If the app finds one
that answers, it starts none: it asks `engenty-wizards open --print` for a ticket and shows that
runtime. When it stops, the app starts its own. The other way round, `engenty-wizards` opens the
app's runtime in the browser instead of starting a second one.

**Data from the app's own folder.** Earlier builds kept the data in
`~/Library/Application Support/com.engenty.wizards/data`. If `~/.engenty/wizards/data` does not
exist yet, that folder is moved there at the first start.

**Quit** (⌘Q, menu, tray) sends the process group of the runtime the app started SIGTERM, waits
up to 4 s, then SIGKILL; a running installer is stopped the same way. A runtime the command line
started is left running. If the app is killed instead, the watchdog inside the runtime notices
within 2 s and ends it. A runtime that stops by itself is started again once; the second time
the window shows the error with the end of its log. Closing the window keeps the app, and
running wizards, alive in the Dock and the menu bar.

**Open at Login** (app menu and tray menu): a LaunchAgent,
`~/Library/LaunchAgents/com.engenty.wizards.login.plist`, that runs
`open -g -a "engenty wizards.app" --args --at-login` at login. Started that way the app keeps its
window closed and only starts the server; without a server chosen yet it shows the window, which
asks for one. The file is all the state there is. Since the app is not offered (2026-10-04),
`engenty-wizards autostart on|off` writes a LaunchAgent of the same name that runs the command
itself (`start --no-open`); either one replaces the other.

**Logs:** `~/Library/Logs/com.engenty.wizards/` — `runtime.log` (stdout and stderr of the
runtime the app started), `shell.log` (the app, and the installer's lines). Help → "Protokolle
anzeigen". The installer's own log is `~/.engenty/wizards/logs/install.log`.

**Server choice.** First start shows "Dieser Mac" (the local install), "Eigener Server" (an
https address) and "engenty Cloud" (`CLOUD_URL` in `src/state.rs`). The choice is stored in
`~/Library/Application Support/com.engenty.wizards/server.json`; "Server wechseln…" in the
app menu and the tray opens the page again. With a remote server nothing is installed and no
local runtime is started (one the app started is stopped).

**Deep links:** `engenty-wizards://w/<id>` opens that wizard in the studio (`/studio/edit/<id>`);
`engenty-wizards://new` and `engenty-wizards://settings` work too;
`engenty-wizards://new?starter=<id>` opens that template of the marketplace, as its page at
`engenty.ai/wizards/<id>` links it. Nothing else is taken from a link.

**Development and tests:**

| Variable | |
|---|---|
| `ENGENTY_WIZARDS_SERVER=local\|cloud\|<url>` | picks the server without storing it |
| `ENGENTY_HOME=<dir>` | the install is `<dir>/wizards`, as for the command line |
| `ENGENTY_WIZARDS_DATA_DIR=<dir>` | another data folder |
| `ENGENTY_WIZARDS_RUNTIME=<dir>` | run this folder (a checkout) instead of the install; nothing is installed |
| `ENGENTY_WIZARDS_NODE=<path>` | the Node for that; default: `node` of the login shell |
| `ENGENTY_WIZARDS_PACKAGE=<tarball or npm spec>` | what the installer installs instead of the registry's package |
| `ENGENTY_WIZARDS_NO_LINK=1` | the installer does not link the command into `~/.local/bin` |

Debug builds only: `ENGENTY_WIZARDS_PROBE=1` makes every server page report its address, title
and a few facts into `shell.log`, `ENGENTY_WIZARDS_PROBE_EVAL=<expression>` adds a value of your
choice, `ENGENTY_WIZARDS_DOWNLOAD_DIR=<dir>` saves downloads there.

## What web content may do

The window shows the app's own page (`tauri://localhost`), the runtime on this machine
(`http://127.0.0.1:<port>`, or `http://localhost:<port>` when the command line started it) or a
remote server (https). `build.rs` names every command of the
app, so each one needs a capability:

| Page | Commands |
|---|---|
| the app's own page (`capabilities/shell.json`) | `shell_state`, `choose_server`, `enter_server`, `retry_start`, `open_logs`, `open_server_choice` |
| the chosen server's origin — exactly that origin, capability added when it is shown (`window.rs`, `grant`) | `open_external` (http/https only), `open_server_choice`, `set_chrome` (title bar colour) |
| any other page | none |

No plugin command is granted to any page: no file access, no shell, no process control. A
remote server gets the same three commands as the local runtime and nothing local.

- `window.engentyDesktop.open(url)` is defined by an initialization script (`src/bridge.js`).
  The same script sends `window.open` and links with `target=_blank` to the person's browser;
  `on_new_window` denies every new webview (also from frames) and opens the address in the
  browser instead.
- With the local runtime, a foreign page that ends up in the window is sent to the browser
  and the window goes back. With a remote server, foreign pages may load in the window (its
  sign-in redirects through the Manage-App) but get no command.
- Downloads go to the Downloads folder (numbered when the name exists) and are shown in
  Finder. A link to `/api/…` is always saved, never shown: WKWebView would otherwise display a
  PDF or play an MP4 in place of the studio.
- Camera and microphone: WKWebView asks the app for each `getUserMedia` call; the app grants
  it to pages of the chosen server and denies it elsewhere. macOS asks the person once
  (`NSCameraUsageDescription`, `NSMicrophoneUsageDescription`). `http://127.0.0.1` counts as a
  secure context in WKWebView, so `navigator.mediaDevices` exists there.

## Signing and notarization — prepared, NOT verified

This machine has no Developer ID (`security find-identity -v -p codesigning` → 0 identities).
The build is ad-hoc signed (`bundle.macOS.signingIdentity: "-"`): it runs on the Mac that built
it and on a Mac that got it without a quarantine attribute (above); a copy a browser downloaded
is blocked by Gatekeeper until `xattr -dr com.apple.quarantine "/Applications/engenty wizards.app"`.

Verified here: the ad-hoc build carries the hardened-runtime flag and the entitlements below
(`codesign -dv --entitlements -` → `flags=0x10002(adhoc,runtime)`), `codesign --verify --deep
--strict` passes on the build and on a copy installed from the archive, the installed copy
carries only `com.apple.provenance`, and under these entitlements the window loads the studio as
a secure context with `navigator.mediaDevices`. Everything else in this section is written from
the Tauri and Apple documentation and has not been run.

What a signed, notarized build needs:

1. **Identity.** A "Developer ID Application" certificate in the keychain (in CI: imported from
   `APPLE_CERTIFICATE` — base64 .p12 — with `APPLE_CERTIFICATE_PASSWORD`).
2. **Hardened runtime and entitlements.** `tauri.conf.json` sets `hardenedRuntime: true` and
   `entitlements: entitlements.plist`: `device.camera`, `device.audio-input` and
   `personal-information.location` for the webview. The bundle holds one Mach-O file, the app's
   own binary — no Node and no native addons, so nothing else needs a signature. The Node the
   runtime runs on is the build from nodejs.org in `~/.engenty/wizards/tools`, signed and
   notarized by its publisher with its own entitlements.
3. **Build, notarize, staple.** With the identity and one set of notarization credentials in
   the environment, `tauri build` signs, submits to the notary service, waits and staples:

   ```bash
   export APPLE_SIGNING_IDENTITY="Developer ID Application: <name> (<TEAMID>)"
   # either an app-specific password …
   export APPLE_ID=… APPLE_PASSWORD=… APPLE_TEAM_ID=…
   # … or an App Store Connect API key
   export APPLE_API_KEY=… APPLE_API_ISSUER=… APPLE_API_KEY_PATH=/path/AuthKey_<id>.p8
   cd apps/desktop && pnpm tauri build
   ```
4. **Check.** `codesign --verify --deep --strict --verbose=2 "engenty wizards.app"`,
   `spctl -a -vv "engenty wizards.app"`, `xcrun stapler validate …`, then start it on a Mac
   that never saw it: the installer must run, the runtime must come up, the Keychain must take
   a key (the runtime calls `security`), and a photo field must get the camera.

Once the app is notarized it can also be offered as a dmg download.

## Measured (2026-10-04, Apple M4, macOS 26.5)

| | |
|---|---|
| App bundle, release | 7.2 MiB in 8 files (the app binary is 7.0 MiB) |
| Archive of it (`.tar.gz`) | 3.1 MiB |
| The install in `~/.engenty/wizards` | 774 MB: runtime and its `node_modules` 645 MB, Node 130 MB |
| The installer, nothing cached | 49 s (Node download, `npm install` of about 530 packages) |
| First start of the app on an empty folder | 28 s to a loaded studio, packages already in npm's cache |
| Start to a loaded studio, installed | 1.9–2.0 s |
| of which | runtime until `/api/health` 1.6–1.7 s |
| Runtime shortly after start | 424 MB resident |
| App itself | 100 MB resident, plus the WebKit processes |

Before, with the runtime inside the app: 390 MiB in 22 419 files, a 106 MiB dmg.

## Not built or not verified

- Signing with a Developer ID and notarization (above).
- A second Mac: the app was installed from its archive on the Mac that built it only. That a
  Mac which never saw it opens the ad-hoc signed copy without a warning is expected from how
  quarantine works, and not tried.
- Windows and Linux: there are platform branches in the Rust code, but nothing was compiled or
  run there; the installer the app runs is a bash script, and `SECRETS=keychain` is macOS only
  in the server.
- An x64 or universal macOS build: only arm64 was built, and the release workflow builds only that.
- Auto-update of the app: none. `engenty-wizards update` fetches a newer archive; the app itself
  only updates the runtime, when it is older than the app.
- Camera and microphone end to end: the page sees a secure context and
  `navigator.mediaDevices`; the macOS prompt and a real capture need a person. The ad-hoc
  signature has no stable identity, so macOS asks again after every new build.
- Location fields: the usage texts and the entitlement are there; WKWebView has no delegate for
  geolocation on macOS, so whether a prompt appears was not tried.
- Opening the browser (`engentyDesktop.open`, `target=_blank`, `window.open`), the menu, the
  tray and the title bar colour were not tried by hand. `open_external` was only called with an
  address it must refuse.
- Remote servers: tried against a second local runtime only. Sign-in at a cloud runtime runs
  inside the window; Google refuses sign-in in embedded views, so that needs a hand-off through
  the system browser on the server side.
