# Plan: the mobile app (iOS and Android)

Status: concept, nothing of it is built. Written on 2026-10-05.

Scope: an app from the App Store and Google Play that adds published wizards, runs them, shows
and shares their results and keeps past results. Building wizards (the studio) is not part of
this plan.

## What is there today

| | Where |
|---|---|
| A wizard's link `/w/<token>` runs in a phone's browser | `apps/web/src/runner/` |
| Camera and clips, code scan, location, voice note, signature, wake lock, notify, "add to home screen" | `runner/{camera,scan,location,voice,signature,device}.*`, `public/sw.js` |
| The result: deliverables with a download per format, a file into the share sheet, a link `/s/<token>` | `runner/outputs.tsx`, `share/ShareSheet.tsx`, `services/shares.ts` |
| The API of a run: no session, the visitor cookie `wz_vid` | `apps/runtime/src/routes/runs.ts` |

What a browser does not do, and the app is for:

| Gap | Today |
|---|---|
| The person's wizards in one place | one home-screen icon per wizard, at best |
| Past results | the last run per wizard (`wz.run.<token>` in localStorage); the server deletes a live run after `RESULT_TTL_DAYS` (7) |
| A notification when the page is closed | none; a step that renders a film takes minutes |
| A scanned QR code | opens a browser tab, nothing remembers the wizard |
| Share sheet, saved files | only where the browser has them |

## The app

React Native with Expo, in `apps/mobile` of this repo: one TypeScript codebase for both stores,
native screens, the types of `packages/shared`. German and English, light and dark, the web's
palette. Bundle id `ai.engenty.wizards`.

| Screen | What it does |
|---|---|
| Wizards | the wizards the person added: avatar, title, brand, the runtime's host when it is not engenty.ai, the last run. Tap starts a run or resumes an unfinished one. Swipe removes. |
| Add | the scanner, and a field for an ID or a pasted link. Shows the wizard (`PublicWizard`: title, description, avatar, brand, `available`) before it is added. |
| Run | the runner (below) |
| Results | every run made in the app, newest first, with its wizard and status. Opens without a connection. |
| Result | the deliverables: shown, shared, saved. While the server still has the run: open it in the runner, share its link. |
| Settings | language, theme, notifications, storage used by results, another runtime's address for IDs |

A wizard in the app is `{ runtime, token }` plus what `GET /api/public/wizards/:token` answered.
The list, the runs and the results are kept on the device (SQLite, files in the app's folder).
Adding and running need a connection: the steps run on the runtime.

## The run stays the runtime's runner

The Run screen is a WebView on `<runtime>/w/<token>?app=1`, not a runner drawn again in native
views.

- The runner belongs to its runtime's release: 18 field kinds, reviews, asks, lists, connections,
  the definition version. A second runner in the app would lag behind every release and could
  not run a wizard of a newer runtime.
- Widgets, documents and dashboards are HTML anyway.
- Turnstile, the wizard's browser (sign-in asks) and connecting accounts work as they are.
- A runtime on someone's own server serves the runner that fits it.

`?app=1` works like the embed switch (`lib/embed.ts`): the runner drops its brand header,
footer, theme toggle and install hint, and asks `window.engentyApp` (as the studio asks
`window.engentyDesktop`) before it uses a browser API. The bridge names its version and what it
can do; the runner uses what is there and falls back to its web way. Both directions hold: an
older app shows a newer runner, and a runner that knows no bridge (an older runtime) still runs —
the app sees the run id in the address, catches downloads and new windows itself.

## Access to the phone

| What | Web runner | In the app |
|---|---|---|
| Camera: photos, clips | `getUserMedia`, file input | the same code; the app holds the camera permission and passes it to the WebView |
| Photo library, files | file input | the system's picker |
| Code scan (`scan` on a text field) | `qr-scanner` | bridge: the app's native scanner (all common barcode formats) |
| Location | `navigator.geolocation` | the same; the app holds the permission |
| Voice note | `MediaRecorder` | the same; the app holds the microphone permission |
| Signature | canvas | unchanged |
| Screen stays on | `navigator.wakeLock` | bridge: keep awake |
| Done / waits for you | notification through `sw.js`, sound, vibrate | bridge: local notification, haptics; push when the app is closed (below) |
| Share a file or a link | `navigator.share` | bridge: the native share sheet |
| Download | `<a download>` | bridge: into the app's results, from there to Files, Photos, other apps |
| Connect an account (OAuth) | a popup (`window.open`) | the system's sign-in sheet (ASWebAuthenticationSession, Custom Tabs); Google refuses a sign-in inside a WebView. The runner hears of it over the run's stream as today. |

Second step, native instead of the web's: a document scanner for `file` fields with `camera`
(edges, several pages, one PDF).

The bridge only offers what the person sees and confirms each time (scanner, share sheet, saved
file, sign-in sheet). It answers the top frame of the runtime the wizard was added from; a
widget's sandboxed frame never reaches it.

Contacts, calendar, NFC, phone calls: not there today, on the web neither. Each would be a new
field kind or result action in the definition (additive, no new definition version), with the
web runner saying "only in the app". Not in this plan.

## Adding a wizard

The QR code holds the wizard's link, `<APP_URL>/w/<token>`. Nothing new is encoded: a phone
without the app opens the web runner as today.

| Way | How |
|---|---|
| The phone's camera, app installed | Universal Links (iOS) and App Links (Android) for `engenty.ai/w/*` and `engenty.ai/s/*`: the app opens on the wizard. The runtime serves `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`; the proxy on engenty.ai already sends `/.well-known` to it. |
| The app's scanner | takes any `https://<host>/w/<token>`; a `/s/<token>` link opens the shared result |
| ID | a short code, see below. Asked at engenty.ai, or at the runtime named in the settings. A pasted link or token works in the same field. |
| A runtime on another host | its domain is not in the app, so the phone's camera opens the browser. The web runner offers "open in the app" (`engenty-wizards://w?url=…`). The app names the host before it adds a wizard from a runtime it has not seen. |

**The ID.** Today's id is the share token: 14 characters, upper and lower case, `_` and `-`.
Nobody types that on a phone. New: a code of 8 characters, capitals and digits without
look-alikes, made with the share token and rotated with it (`rotate-link`); a link of kind `code`
in the control database; `GET /api/public/codes/:code` answers the token.

**The studio.** `ShareDialog` shows the link as a QR code (to download as PNG and SVG) and the
ID. A local install shows them for the wizard's copy in the cloud: a local runtime answers only
on `localhost`. A QR generator is new; `qr-scanner` only reads.

## Who the person is

A run belongs to a visitor: the `wz_vid` cookie. The app makes one visitor id per runtime, keeps
it in the Keychain / Keystore, and gives it to the WebView as that cookie and to its own
requests (the run's view, downloads). The runtime needs no change for it.

Runs are reachable from this device only; a new phone starts empty. With an account (the
Manage-App's sign-in) results could follow the person — later, not in this plan.

## Results on the device

When a run is done the app reads its view (`GET /api/runs/:id`) and keeps the result: title,
message, the deliverables (`shown` with `formats` and `label`), each deliverable's file in its
first format (`/api/runs/:id/steps/:stepId/download?format=…`) and its assets. Other formats are
fetched when asked for, as long as the server has the run (`expiresAt`).

| File | Shown with |
|---|---|
| PDF, DOCX, XLSX, CSV, PNG, MP4, MP3 | Quick Look (iOS), the system's viewer (Android) |
| HTML, Markdown, text, JSON | a WebView without network access |

Media a model made or changed keep their label (`ai` on the asset) in every view of the app.

Not kept: the person's answers and uploads. Deleting a result deletes its files; the settings
show what results take and clear them.

## Sharing

The shareable ones are the deliverables of the result step — what `/s/<token>` shows; never
answers, uploads or steps in between.

| | How |
|---|---|
| A file | the native share sheet with the deliverable in the chosen format, several at once. From the device's copy: works without a connection and after the server deleted the run. Photos, Files, print come with the sheet. |
| The link | `POST /api/runs/:id/share`, the `/s/<token>` address into the share sheet; says until when it is valid; withdraw with `DELETE`. Gone once the run expired. |
| Received | a `/s/<token>` link opens in the app, read-only; "make your own" adds the wizard (`wizardUrl`) |

## Notifications

- **App open or just left:** the bridge shows a local notification when the run is done, failed
  or asks. iOS suspends the app within seconds, so this covers short steps only.
- **App closed:** push. The app registers its device token for the run
  (`POST /api/runs/:id/notify`); the runtime tells a push relay when the run is done, failed or
  asks. The relay holds the APNs and FCM keys and belongs to the Manage-App
  (an addition to `manage-contract.md`); a runtime on its own server may use it or has no push.

## Changes outside the app

| Where | What |
|---|---|
| `apps/web/src/runner/` | `?app=1`; `window.engentyApp` before `navigator.share`, downloads, `scan.tsx`, `device.ts` (wake lock, notify), the connect popup in `store.tsx` |
| `apps/web/src/studio/editor/ShareDialog.tsx` | QR code and ID |
| `apps/web/src/runner/PublicRunner.tsx` | "open in the app" in a phone's browser |
| `apps/runtime/src/routes/runs.ts` | `GET /api/public/codes/:code`; `POST /api/runs/:id/notify` |
| `apps/runtime/src/services/wizards.ts`, `tenants/control.ts` | the code beside the share token: made, rotated, forgotten |
| `apps/runtime/src/app.ts` | the two `/.well-known` files |
| `apps/runtime/src/engine/` | tell the relay when a run with a device token is done, failed or asks |
| Repo | `apps/mobile` in the workspace without a `build` script (`pnpm -r build` must not need Xcode); its own version and tag (`mobile-vX.Y.Z`), since a store review does not follow the runtime's releases; store accounts and signing keys stay closed |

## Stores

- Apple reviews an app that shows software from elsewhere as such (guideline 4.7) and refuses a
  wrapped website (4.2). The native scanner, the list, results without a connection, the share
  sheet and push are what makes it an app. Likely asked for: a way to report a wizard, and an age
  rating that fits what wizards may show. To be read again before the first submission.
- Nothing is sold in the app: a run spends the credits of the wizard's owner.
- Every permission (camera, microphone, location, notifications) is asked at the first field
  that needs it, with its reason.

## Steps

1. **Runtime and web.** `?app=1` and the bridge in the runner; QR code and ID in the studio; the
   code route; the `/.well-known` files. Ships with a normal release and is useful without the
   app (the QR code).
2. **The app, first version, both stores.** Wizards, Add (scanner, ID, link), Run with the
   permissions and the bridge, results on the device, share sheet, links into the app.
3. **Notifications.** The push relay, the device token per run.
4. **More of the phone.** The document scanner; then new field kinds, when wizards ask for them.

## Not in this plan

- The studio on the phone.
- An account in the app, results on several devices.
- Browsing the marketplace in the app: its entries are templates to build from, not published
  wizards to run.
- Sharing into the app from another app (a photo or a PDF starts a wizard).
- A home-screen shortcut or widget per wizard.

## Open

- The runner in a WebView, as planned here, or drawn in native views. Native views would mean a
  second runner that follows every definition change.
- `apps/mobile` in this open repo (planned), or closed.
- The ID: 8 characters, or shorter with a rate limit on the lookup.
- Runtimes on other hosts in the first version, or engenty.ai only.
- Who runs the push relay for runtimes that run alone.
