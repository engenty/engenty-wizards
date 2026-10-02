# engenty wizards — desktop app

A [Tauri 2](https://v2.tauri.app) app (macOS first) that brings the runtime along: the same
server as in the cloud, started as a Node sidecar on a loopback port, with the studio loaded
into one window. Nothing in `server/`, `web/` or `shared/` is specific to the desktop app.

```
desktop/
├── ui/                      the app's own page: splash, server choice, error
├── src-tauri/
│   ├── src/                 lib.rs (start, quit, deep links) · sidecar.rs (the runtime process)
│   │                        window.rs (what the window may load; links, popups, downloads)
│   │                        commands.rs · menu.rs · environment.rs · state.rs · bridge.js
│   ├── capabilities/        shell.json — commands of the app's own page
│   ├── sidecar/watchdog.mjs ends the runtime if the app is killed
│   ├── entitlements.plist   hardened-runtime entitlements (Node JIT, addons, camera, mic)
│   ├── Info.plist           usage texts (camera, microphone, location), merged into the bundle
│   ├── resources/server/    the runtime            ┐ assembled by
│   └── binaries/node-<triple>  the Node binary     ┘ scripts/desktop-bundle.mjs (not in git)
└── package.json             own package: `@tauri-apps/cli` only
```

## Build and run

Node ≥ 24.11, pnpm, Rust (stable), Xcode command line tools.

```bash
pnpm install                         # repo root, once
node scripts/desktop-bundle.mjs      # the runtime + Node into desktop/src-tauri/
cd desktop && pnpm install           # once: the Tauri CLI
pnpm tauri build --debug --bundles app   # → src-tauri/target/debug/bundle/macos/engenty wizards.app
CI=true pnpm tauri build                 # release: …/release/bundle/macos/*.app and …/dmg/*.dmg
pnpm tauri dev                           # run from source; needs the bundle step too
```

`CI=true` keeps the dmg step from scripting Finder to lay out the disk image window. Start a
built app with `open "src-tauri/target/release/bundle/macos/engenty wizards.app"`.

`scripts/desktop-bundle.mjs` runs the root build (vite, tsc) straight into
`src-tauri/resources/server/`, installs the production `node_modules` there — only packages the
built server imports, flat (`node-linker=hoisted`, no symlinks), versions from the root
lockfile — prunes docs, typings, source maps and foreign prebuilds, and copies a Node binary to
`src-tauri/binaries/node-<target-triple>`. Options: `--target <triple>`, `--node <path>`,
`--skip-build`. Chrome is not bundled: PDF and PNG use the installed Chrome or Edge.

A local build copies the Node that runs the script. CI fetches the official build for the
target instead and passes it with `--node`:

```bash
V=24.14.0; A=arm64   # or x64
curl -fsSLO https://nodejs.org/dist/v$V/node-v$V-darwin-$A.tar.gz
curl -fsSL https://nodejs.org/dist/v$V/SHASUMS256.txt | grep "darwin-$A.tar.gz" | shasum -a 256 -c -
tar -xzf node-v$V-darwin-$A.tar.gz
node scripts/desktop-bundle.mjs --target aarch64-apple-darwin --node node-v$V-darwin-$A/bin/node
```

The app version is the root `package.json` version.

## What the app does

**Start.** It picks a free loopback port (the one of the last start when it is still free —
kept in `data/desktop.port` — so links into the local runtime outlive a restart) and a random
access key, resolves the PATH of the person's login shell once (a GUI app gets a minimal one;
the Studio chat runs the installed `claude`, widgets use `ffmpeg`), and starts
`node --import watchdog.mjs dist-server/server/index.js` in `Contents/Resources/server` with

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `API_HOST` / `API_PORT` | `127.0.0.1` / the port |
| `APP_URL` | `http://127.0.0.1:<port>` |
| `DATA_DIR` | `~/Library/Application Support/com.engenty.wizards/data` |
| `LOCAL_ACCESS_KEY` | 24 random bytes, new at every start |
| `SECRETS` | `keychain` |
| `CHROME_PATH` | the installed Chrome, Edge, Chromium or Brave, if any |
| `PATH` | the login shell's |

The runtime inherits only a short list of other variables (`src/environment.rs`): home and
locale, proxy and certificate settings, `ACCOUNT_URL`, `ACCOUNT_GATEWAY_URL`, `CLOUD_URL`,
`OLLAMA_URL`, `FFMPEG_PATH`, `MODEL_*`. It never gets `MANAGE_URL`.

The window shows a splash until `GET /api/health` answers, then loads
`/api/local/enter?k=<key>`, which sets the studio's cookie and redirects to `/`.

**Quit** (⌘Q, menu, tray) sends the runtime's process group SIGTERM, waits up to 4 s, then
SIGKILL. If the app is killed instead, the watchdog inside the runtime notices within 2 s and
ends it. A runtime that stops by itself is started again once; the second time the window
shows the error with the end of its log. Closing the window keeps the app, and running
wizards, alive in the Dock and the menu bar.

**Logs:** `~/Library/Logs/com.engenty.wizards/` — `runtime.log` (stdout and stderr of the
runtime), `shell.log` (the app). Help → "Protokolle anzeigen".

**Server choice.** First start shows "Dieser Mac" (built in), "Eigener Server" (an https
address) and "engenty Cloud" (`CLOUD_URL` in `src/state.rs`). The choice is stored in
`~/Library/Application Support/com.engenty.wizards/server.json`; "Server wechseln…" in the
app menu and the tray opens the page again. With a remote server the built-in runtime is not
started (and is stopped if it ran).

**Deep links:** `engenty-wizards://w/<id>` opens that wizard; `engenty-wizards://new` and
`engenty-wizards://settings` work too. Nothing else is taken from a link.

**Development and tests:** `ENGENTY_WIZARDS_SERVER=local|cloud|<url>` picks the server without
storing it; `ENGENTY_WIZARDS_DATA_DIR=<dir>` uses another data folder. Debug builds only:
`ENGENTY_WIZARDS_PROBE=1` makes every server page report its address, title and a few facts
into `shell.log`, `ENGENTY_WIZARDS_PROBE_EVAL=<expression>` adds a value of your choice,
`ENGENTY_WIZARDS_DOWNLOAD_DIR=<dir>` saves downloads there.

## What web content may do

The window shows the app's own page (`tauri://localhost`), the built-in runtime
(`http://127.0.0.1:<port>`) or a remote server (https). `build.rs` names every command of the
app, so each one needs a capability:

| Page | Commands |
|---|---|
| the app's own page (`capabilities/shell.json`) | `shell_state`, `choose_server`, `enter_server`, `retry_start`, `open_logs`, `open_server_choice` |
| the chosen server's origin — exactly that origin, capability added when it is shown (`window.rs`, `grant`) | `open_external` (http/https only), `open_server_choice`, `set_chrome` (title bar colour) |
| any other page | none |

No plugin command is granted to any page: no file access, no shell, no process control. A
remote server gets the same three commands as the built-in runtime and nothing local.

- `window.engentyDesktop.open(url)` is defined by an initialization script (`src/bridge.js`).
  The same script sends `window.open` and links with `target=_blank` to the person's browser;
  `on_new_window` denies every new webview (also from frames) and opens the address in the
  browser instead.
- With the built-in runtime, a foreign page that ends up in the window is sent to the browser
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
it; on another Mac, Gatekeeper blocks a downloaded copy until
`xattr -dr com.apple.quarantine "/Applications/engenty wizards.app"`.

Verified here: the ad-hoc build carries the hardened-runtime flag and the entitlements below on
the app binary and on Node (`codesign -dv --entitlements -` → `flags=0x10002(adhoc,runtime)`),
`codesign --verify --deep --strict` passes, the runtime starts and opens its databases under
them, and `APPLE_SIGNING_IDENTITY` wins over the "-" in the config (a made-up identity fails
with "no identity found"). Everything else in this section is written from the Tauri and Apple
documentation and has not been run.

What a signed, notarized build needs:

1. **Identity.** A "Developer ID Application" certificate in the keychain (in CI: imported from
   `APPLE_CERTIFICATE` — base64 .p12 — with `APPLE_CERTIFICATE_PASSWORD`).
2. **Sign what Tauri does not sign.** Tauri signs the app binary, the Node sidecar
   (`Contents/MacOS/node`) and the bundle. It does not sign files in `Contents/Resources`.
   Notarization rejects any Mach-O file without a Developer ID signature, so the native addons
   there are signed by the bundle script, before `tauri build` seals the bundle:

   ```bash
   export APPLE_SIGNING_IDENTITY="Developer ID Application: <name> (<TEAMID>)"
   node scripts/desktop-bundle.mjs --node <official node>   # signs every Mach-O file it finds
   ```

   The script prints them under "native code" (today: `@libsql/darwin-arm64/index.node`,
   `@napi-rs/canvas-darwin-arm64/skia.darwin-arm64.node`,
   `@msgpackr-extract/…/node.napi.glibc.node`, three `bare-*.bare` prebuilds).
3. **Hardened runtime and entitlements.** `tauri.conf.json` sets `hardenedRuntime: true` and
   `entitlements: entitlements.plist`. Tauri applies the one file to the app binary and to the
   sidecar. Node needs `allow-jit` and `allow-unsigned-executable-memory` (V8);
   `disable-library-validation` covers addons not signed by the same team; the app binary needs
   `device.camera`, `device.audio-input` and `personal-information.location` for the webview.
   The official Node binary comes signed with the same three `cs.*` entitlements; Tauri
   re-signs it with ours.
4. **Build, notarize, staple.** With the identity and one set of notarization credentials in
   the environment, `tauri build` signs, submits to the notary service, waits and staples:

   ```bash
   export APPLE_SIGNING_IDENTITY="Developer ID Application: <name> (<TEAMID>)"
   # either an app-specific password …
   export APPLE_ID=… APPLE_PASSWORD=… APPLE_TEAM_ID=…
   # … or an App Store Connect API key
   export APPLE_API_KEY=… APPLE_API_ISSUER=… APPLE_API_KEY_PATH=/path/AuthKey_<id>.p8
   cd desktop && pnpm tauri build
   ```

   By hand, for the dmg:

   ```bash
   xcrun notarytool submit "engenty wizards_<version>_aarch64.dmg" \
     --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID" --wait
   xcrun stapler staple "engenty wizards_<version>_aarch64.dmg"
   ```
5. **Check.** `codesign --verify --deep --strict --verbose=2 "engenty wizards.app"`,
   `spctl -a -vv "engenty wizards.app"`, `xcrun stapler validate …`, then start it on a Mac
   that never saw it: the runtime must come up (JIT), the database must open (addon loading),
   the Keychain must take a key (the sidecar calls `security`), and a photo field must get the
   camera.

Open points of that path: whether the notary accepts the bundle as laid out (about 22 000
files, Mach-O files under `Resources`), whether the `.bare` prebuilds can be deleted instead of
signed, and whether one entitlements file for both binaries is acceptable or the app binary
should get one without the `cs.*` keys.

## Measured (2026-10-02, Apple M4, macOS 26.5)

| | |
|---|---|
| App bundle, release | 390 MiB in 22 419 files (Node 113 MB, `node_modules` 260 MB, app binary 7 MB) |
| DMG, release | 106 MiB |
| Start to a loaded studio | 4.5 s the first time after a build, 1.9–2.3 s after that |
| of which | login shell PATH ~1.2 s (in parallel), runtime until `/api/health` 1.6–2.1 s, page ~0.4 s |
| Idle runtime | 350 MB resident, 369 MB physical footprint |
| App itself | 24 MB physical footprint, plus the WebKit processes |

## Not built or not verified

- Signing with a Developer ID and notarization (above).
- Windows and Linux: there are platform branches in the Rust code, but nothing was compiled or
  run there; `SECRETS=keychain` is macOS only in the server.
- Auto-update: none. A new version is a new dmg.
- An x64 or universal macOS build: the bundle script takes `--target x86_64-apple-darwin` and
  writes `supportedArchitectures` for pnpm, but only arm64 was built.
- Camera and microphone end to end: the page sees a secure context and
  `navigator.mediaDevices`; the macOS prompt and a real capture need a person.
- Location fields: the usage texts and the entitlement are there; WKWebView has no delegate for
  geolocation on macOS, so whether a prompt appears was not tried.
- Opening the browser (`engentyDesktop.open`, `target=_blank`, `window.open`), the menu, the
  tray and the title bar colour were not tried by hand. `open_external` was only called with an
  address it must refuse.
- Remote servers: tried against a second local runtime only. Sign-in at a cloud runtime runs
  inside the window; Google refuses sign-in in embedded views, so that needs a hand-off through
  the system browser on the server side.
