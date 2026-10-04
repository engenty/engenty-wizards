# Developing engenty wizards

For working on the code. To install and use engenty wizards, see the [README](../README.md).

## Two ways to run it

| | Alone | Managed |
|---|---|---|
| What | one person, one tenant, on this machine: the desktop app, `pnpm dev`, your own server | the runtime of a Manage-App (`MANAGE_URL`): many tenants |
| Sign-in | a one-time link printed at start (the desktop app opens it itself); an account is optional | at the Manage-App (OAuth 2.1 / OIDC); the token names user, tenant and role |
| Database | `DATA_DIR/tenants/local.db` + `DATA_DIR/control.db` | one libSQL database per tenant + a control database (Turso) |
| Models | an AI client installed on the machine, on its own subscription (Claude Code, Codex, Gemini CLI, Cursor Agent), own keys (AI Gateway, OpenAI, Anthropic), a local model (Ollama), or a linked account's credits | the Manage-App's model-gateway; the runtime holds no model keys |
| Studio chat | a model of class `highest`, or the admin's own Claude subscription (the installed Claude Code runs headless) | a model of class `highest` |
| Files | `DATA_DIR/objects` | an S3-compatible bucket (R2) |

The Manage-App (accounts, tenants, credits, the model-gateway) is a separate, closed app. What
the two speak is in [manage-contract.md](manage-contract.md).

A step names a **model class** — `classifier`, `standard`, `high`, `highest`, plus `image`,
`video`, `audio` (listens to voice notes), `speech` (reads a voice-over aloud) — and an optional
effort hint, never a model. Which model serves a class is
bound outside the wizard: in the model-gateway, or under Settings → "Modelle & Konto".

## Layout

A pnpm workspace:

| | |
|---|---|
| `apps/runtime/` | the server: API, step runner, databases, models (`src/`), its tests (`test/`) |
| `apps/web/` | the SPA: studio, public runner, share page |
| `apps/desktop/` | the desktop app (Tauri 2) around both |
| `packages/shared/` | types and schemas the server and the SPA both use |
| `plugin/` | the Claude Code plugin template |
| `deploy/` | the Chromium container of the cloud runtime |

`.env.local` and the data folder (`data/`) stay in the repo root; `pnpm dev` and `pnpm start`
run from there.

## Run locally

```bash
pnpm install
cp .env.example .env.local   # set AI_GATEWAY_API_KEY (or another key); DEV_LOGIN=1
pnpm dev                     # web on :5181, API on :8891
```

With Portless: `portless alias wizards 5181`, set `APP_URL=https://wizards.localhost`, open
https://wizards.localhost. "Dev-Login" lets you in (local only); without `DEV_LOGIN` the server
prints a one-time link at start.

Local Chrome renders PDFs/PNGs (`CHROME_PATH`), ffmpeg encodes widget animations to MP4
(`FFMPEG_PATH`) and cuts films: a widget step with `video: true` draws clips and stills frame by
frame and gets voice-over and clip sound mixed in. The shell/code tool runs in a sandbox per run, chosen with `SANDBOX`:
`docker` needs Docker and the `engenty-sandbox` image; `agentos` runs an
[agentOS](https://rivet.dev/agentos/) VM inside the server process (macOS and glibc Linux, no
Docker) with a smaller toolset — sh, coreutils, node, npm, and Python as a separate tool without
pandas, pillow or matplotlib; `off` removes the tool. Unset, it is `docker` when the image is on
the machine, else `agentos` when its packages are installed (a checkout has them), else `off`.
The agent is told what the chosen sandbox runs (`apps/runtime/src/sandbox`).

`APP_URL` defaults to `http://localhost:5181` from source (the Vite dev server) and to
`http://localhost:<API_PORT>` when built (`pnpm start` serves the pages itself).

A data folder from before tenants (`DATA_DIR/wizards.db`) is taken over into the local tenant at
the first start; the old file stays.

## AI media and the AI Act

Media a model made or changed says so in two ways (Art. 50): in the file and on the page.

- **In the file** (`apps/runtime/src/media/marking.ts`): the IPTC Digital Source Type in the XMP
  of PNG, JPEG and MP4 files, ID3 tags on a voice-over. A file that arrives marked — image models
  sign their output with C2PA Content Credentials — is kept byte for byte, since changing it would
  break the signature. A film is re-encoded when it is cut, so it gets its own marking.
- **On the page**: the asset's reference carries `ai: "generated" | "edited"`, and every view shows
  a label over such media. Nothing is drawn into an image. A film shows one line in the picture,
  because it is published as a file, away from these pages.

Not done here: signing our own Content Credentials (needs a certificate), and the EU's common icon.

## Checks

```bash
pnpm fix && pnpm lint && pnpm typecheck && pnpm test && pnpm build
node scripts/e2e-starter.mjs invoice '<answers json>'   # drive a starter end to end via the API
# { "$file": "path" } as a value uploads that file; API=http://127.0.0.1:<port> names another server
```

`apps/runtime/test/tenants.test.ts` is the leak test: two tenants, two databases, nothing of one
visible to the other. `apps/runtime/test/managed.test.ts` runs the runtime against a stand-in
Manage-App.

GitHub runs lint, typecheck, test and build on every push to `main` and every pull request
(`.github/workflows/ci.yml`).

## Releases and changelog

The version is the `version` of the root `package.json`; a release is the tag `vX.Y.Z` on `main`.
Before `1.0` a **minor** bump is a notable or breaking change, a **patch** is fixes and small
features. The version says which release this is; the commit says which build.

Commits follow [Conventional Commits](https://www.conventionalcommits.org). The type decides the
group in the changelog, a scope (`fix(runner): …`) shows in brackets, `!` marks a breaking change:

| Type | Group |
|---|---|
| `feat` | Added |
| `fix` | Fixed |
| `perf` | Performance |
| `refactor` | Changed |
| `deploy` | Deploy |
| `docs` | Docs |
| `chore`, `ci`, `test`, `build`, `style`, merges | left out |
| anything else | Other |

```bash
pnpm release               # shows the changes, asks patch / minor / major, lets you edit the entry,
                           # then writes the files below, bumps package.json, commits and tags — locally
pnpm release --changelog   # only refreshes the files; commits since the last tag stay under "Unreleased"
pnpm about:data            # only the app's copies: changelog and open-source credits
git push origin main --follow-tags
```

`RELEASE_BUMP=patch|minor|major|current` skips the questions; `current` releases the version
`package.json` already has, as long as it has no tag (the first release). The format and the
groups are in `cliff.toml` ([git-cliff](https://git-cliff.org)), the steps in `scripts/release.mjs`.

| File | What it is |
|---|---|
| `CHANGELOG.md` | the changelog to read, one block per release |
| `changelog.json` | the same as data: git-cliff's context |
| `apps/web/src/about/changelog.json` | what the app shows, cut down from `changelog.json` |
| `apps/web/src/about/oss-credits.json` | the direct dependencies of the workspace with version and license (`pnpm licenses list`), shared ones first, then per app |
| `apps/web/src/about/product-credits.ts` | written by hand: the product and what it is mainly built with |

None of them is edited by hand except `product-credits.ts`. In the app, the studio's footer shows
the version and opens the changelog and the open-source credits (`apps/web/src/about/`). The
credits list what `package.json` files name; the Rust crates of the desktop app are not in it.

The tag starts nothing. The cloud runtime follows `main` (see [Deploy](#deploy)), so it can be
ahead of the last release; it shows the changelog as it was last written.

## Deploy

Alone, on your own server: see [Run it on a server](../README.md#run-it-on-a-server) in the
README. One container: API + built SPA + Chromium, data on the `/data` volume.

Managed (the cloud runtime): `compose.cloud.yaml` runs the app and a separate Chromium
container that holds no secrets and reaches no database. Set the `MANAGE_*` block, `GATEWAY_URL`,
`APP_SECRET`, the Turso and R2 variables. After a release every tenant database is migrated at
start; a new one migrates when it is first opened.

engenty's own cloud runtime deploys from the branch `deploy/runtime`. After a green push to `main`
the same workflow moves that branch to the commit, if something the images are built from changed
(not for docs, tests or the desktop app), and the server deploys what the branch points at. To go
back to an older commit: `git push --force origin <commit>:deploy/runtime`.

## Desktop app

`apps/desktop/` is a Tauri 2 app (macOS first) that brings this runtime along as a Node sidecar on
the loopback interface and shows the studio in its window. Data lives in the app's data folder,
keys in the Keychain. An account is optional; sign-in runs in the system browser.

```bash
node scripts/desktop-bundle.mjs          # the runtime + production node_modules + Node
cd apps/desktop && pnpm tauri build --bundles app
```

Signing, notarization and the app's rules for what a page in its window may do:
[apps/desktop/README.md](../apps/desktop/README.md).

## Accounts people connect

A wizard can ask the person running it to connect their mailbox; steps then read it (never write).
IMAP works without any setup. For "Gmail" and "Outlook" buttons, give the OAuth client you already
use for sign-in one more redirect URI, `<APP_URL>/api/connect/callback`, and

- Google: enable the Gmail API and add the scope `gmail.readonly` to the consent screen
- Microsoft: add the delegated permission `Mail.Read`

Connected accounts, kept sign-ins, lists and collected files belong to one wizard and one person,
are encrypted where secret (`STORE_ENC_KEY`), and go when unused for `STORE_TTL_DAYS`.

## Connectors

Built in, as engenty ships them: Gmail, Google Drive, Calendar and Contacts, Outlook, OneDrive,
Slack, GitHub (sign-in with OAuth — set the client in `.env`, see `.env.example`), HubSpot and S3
(the person enters a token or keys). The settings show which are set up. Google needs the APIs
enabled and the scopes on the consent screen; a connection asks only for what the wizard's
actions need.

For everything else: in the project settings, search a service (Notion, Stripe, GitHub …) in the
[integrations.sh](https://integrations.sh) registry and import it — from its OpenAPI spec or its
MCP server. The architect and MCP clients can do the same (`find_connectors`, `import_connector`).
A wizard declares a connection to it; the person running the wizard connects their own account
(OAuth, with the client registered on the fly where the server allows it, or an API key). Steps
get the connector's actions as tools: reading is allowed, anything that changes the account asks
the person first, deleting always. `ENGENTY_INTEGRATIONS_REGISTRY_URL` points at another registry.

## Marketplace

The wizards a person can start from on "new" are entries of the marketplace. They live in the
control database (`marketplace_item`, `marketplace_text`, `marketplace_file`) and belong to no
tenant. There is no app of its own for it: the runtime that serves the studio serves the
marketplace, and the cloud runtime is the one every other runtime takes its entries from.

| Where an entry comes from | How it gets into the database |
|---|---|
| The base set in the repo (`apps/runtime/src/starters/`) | At every start, after the migrations. A starter the database does not know is added. A changed starter gets its `revision` raised in `starters/catalog.ts`; every runtime then replaces its row — unless an admin changed that row's wizard, which then belongs to the database. |
| An admin (Settings → Marketplace) | A wizard of the admin's project becomes an entry, or the next revision of one. Admins are the e-mail addresses in `MARKETPLACE_ADMINS`; `local` names the one person of a runtime that runs alone. |
| The source runtime (`MARKETPLACE_URL`, default `CLOUD_URL`) | A runtime that runs alone asks its source once an hour (`/api/public/marketplace/index`, then `/:id/export` for what changed) and keeps the answer, so the list works offline. A new entry reaches every desktop app without a new app. |

- **Sorted by** formats, industries and use cases (set by the admin; the lists are in
  `packages/shared/src/marketplace.ts`). The AI capabilities an entry needs, how much a person
  fills in and how long a run takes are read from its definition. A run's price in credits is
  the formula of `credits/estimate.ts` at the gateway's prices; without prices an entry says
  low, medium or high.
- **Search** (`packages/shared/src/marketplace-search.ts`,
  `apps/runtime/src/services/marketplace-search.ts`): every keystroke is scored by words in the
  browser — BM25 with prefixes and inflections, the scoring of engenty's `search-index` package
  (copied by `scripts/sync-engenty.mjs`). From three words on, the query also goes to
  `POST /api/studio/marketplace/search` (the gallery: `/api/public/marketplace/search`): the model of class `classifier` reads the entries,
  sorts them and drops what does not fit. Answers are kept per question; without a model, after
  8 s, or beyond 30 calls a minute the order by words stands. There are no embeddings: the model
  reads the whole list. A managed runtime's gateway answers only for a tenant, so the gallery
  there searches by words alone; of a sentence's finds, those close to the best are kept.
- **Search terms** (`marketplace_item.search_terms`): what people ask for when they mean an
  entry, German and English — "Reel", "Kostenvoranschlag". The search by words reads them; they
  are never shown. The base set's are written in `starters/catalog.ts` and follow the repo
  without a new revision; for an admin's entry the `classifier` model writes them when it is
  added.
- **Languages**: an entry is written in one language. Adding it translates it into the others
  with a model of class `high`, beside the request; an admin can start a translation again. A
  translation that changes steps or fields, or brings new issues, is thrown away. Where no
  current translation exists the entry shows in its own language. Workspace files are not
  translated.
- **Older apps**: the schema drops what it does not know. An entry counts as usable only when
  this app reads its definition without losing anything; else it is listed as "needs a newer
  app" and cannot be started from.
- **Gallery**: `/gallery` shows the published entries without a sign-in when
  `MARKETPLACE_GALLERY=1`; the list itself (`/api/public/marketplace`) is always public.
- A wizard made from an entry is a copy: `wizard.starter` and `wizard.starter_revision` say
  where it came from, later revisions of the entry do not touch it.

## Build wizards from your own AI client

Admins can author wizards in Claude Code, Codex, Cursor, claude.ai or Claude Desktop, on their own
subscription. The MCP endpoint is `<APP_URL>/api/mcp`. Managed, clients sign in with OAuth 2.1 at
the Manage-App (discovery, dynamic registration or a client metadata document, consent there);
connected apps and API keys are managed in the account. Alone, Settings → "Mit Claude Code & Co.
bauen" issues API keys.

```bash
# Claude Code: plugin with the /wizard command (needs a public https APP_URL)
claude plugin marketplace add <APP_URL>/api/claude-plugin/marketplace.json
claude plugin install engenty-wizards@engenty
# or just the server
claude mcp add --transport http --scope user engenty-wizards <APP_URL>/api/mcp
# Codex
codex mcp add engenty-wizards --url <APP_URL>/api/mcp && codex mcp login engenty-wizards
```

The plugin is built from `plugin/` with this deployment's `APP_URL` filled in
(`apps/runtime/src/plugin.ts`).
Test runs that a client starts spend the tenant's credits. Writes from a client show up live in an
open editor.

## How it is built

| Part | Where |
|---|---|
| Wizard definition (zod) + validator | `packages/shared/src/definition.ts` |
| Step runner (cursor over the definition, pages / back / regenerate / branches) | `apps/runtime/src/engine/runner.ts` |
| Agent + generate steps (Mastra Agent, AI SDK media) | `apps/runtime/src/engine/steps.ts` |
| Agent tools: web search/fetch, sandbox, HTTP, image, MCP | `apps/runtime/src/tools/index.ts` |
| Sandbox engines (Docker, agentOS) and what each runs | `apps/runtime/src/sandbox/` |
| Browser tools: open/click/type, screenshot, sign-in handed to the person, downloads | `apps/runtime/src/tools/browser.ts`, `apps/runtime/src/engine/asks.ts` |
| What a wizard keeps per person: lists, files, connected accounts, sign-ins | `packages/shared/src/store.ts`, `apps/runtime/src/store/`, `apps/runtime/src/tools/store.ts` |
| Mail connectors (Gmail, Outlook, IMAP) in engenty's connector format | `apps/runtime/src/connectors/`, `apps/runtime/src/tools/mail.ts` |
| engenty's built-in connectors (Google, Microsoft, Slack, GitHub, HubSpot, S3), copied unchanged | `apps/runtime/src/engenty/connections-*`, `apps/runtime/src/connectors/builtin.ts` |
| Imported connectors: any service from the integrations.sh registry, by its OpenAPI spec or MCP server | `apps/runtime/src/connectors/external.ts`, `apps/runtime/src/tools/connector.ts`, `apps/web/src/studio/Connectors.tsx` |
| Document reading (PDF, scans and photos, Word, Excel, CSV, mails) and invoice fields | `apps/runtime/src/documents/parse.ts` |
| engenty framework code, copied unchanged (`node scripts/sync-engenty.mjs`) | `apps/runtime/src/engenty/`, `packages/shared/src/engenty/` |
| Architect (prompt → wizard, self-repairing) | `apps/runtime/src/agents/architect.ts` |
| Widgets: bundle (code + data → one HTML), `window.wizard` runtime, PNG/PDF/MP4 export | `apps/runtime/src/widgets/` |
| Workspace files (content-addressed blobs, snapshots per version and run) | `apps/runtime/src/services/files.ts`, `apps/runtime/src/files/blobs.ts` |
| Shared results, link previews, 7-day retention | `apps/runtime/src/services/shares.ts`, `apps/runtime/src/link-preview.ts` |
| Starter wizards: the marketplace's base set | `apps/runtime/src/starters/`, `apps/runtime/src/starters/catalog.ts` |
| Marketplace: entries in the control database, base set, taking over from the source, admin, translation | `packages/shared/src/marketplace.ts`, `apps/runtime/src/services/marketplace.ts`, `apps/runtime/src/services/marketplace-admin.ts`, `apps/runtime/src/routes/marketplace.ts`, `apps/web/src/studio/{Marketplace,MarketplaceAdmin,GalleryPage}.tsx` |
| Tenants: context, one database each, the control database | `apps/runtime/src/tenants/tenant.ts`, `apps/runtime/src/db/client.ts`, `apps/runtime/src/tenants/control.ts` |
| Sign-in: the one-time link alone, the Manage-App's tokens when managed; the linked account | `apps/runtime/src/auth/`, `apps/runtime/src/manage.ts` |
| Model classes: gateway, own keys, local model | `apps/runtime/src/models.ts` |
| Installed AI clients as models (Claude Code, Codex, Gemini CLI, Cursor Agent): headless calls, tools over MCP, sign-in in an inline terminal; first-start setup | `apps/runtime/src/harness/`, `apps/runtime/src/mcp/bridge.ts`, `apps/web/src/studio/{SetupPage,Harness,Terminal}.tsx` |
| Credits: balance, reservation, cost per step; estimate before a run | `apps/runtime/src/credits/credits.ts`, `apps/runtime/src/credits/estimate.ts` |
| Studio chat on the Claude subscription | `apps/runtime/src/agents/subscription.ts` |
| Publish to the cloud, import API | `apps/runtime/src/services/cloud.ts`, `apps/runtime/src/routes/api.ts` |
| Files in the data folder or a bucket, per tenant | `apps/runtime/src/files/objects.ts` |
| Studio (editor, diagram, chat, inspector) | `apps/web/src/studio/` |
| Public runner | `apps/web/src/runner/` |
| Phone inputs: camera and clips, code scan, location, voice note, signature; wake lock, notify, install | `apps/web/src/runner/{camera,scan,location,voice,signature,device}.*`, `apps/web/public/{sw.js,manifest.webmanifest}` |
| Voice notes to text before a step reads them; address of a position (`GEOCODER_URL`) | `apps/runtime/src/media/transcribe.ts`, `apps/runtime/src/engine/prepare.ts`, `apps/runtime/src/geocode.ts` |
| MCP server for authoring (tools, token/API-key gate) | `apps/runtime/src/mcp/` |
| Live editor (SSE stream, merge of concurrent edits) | `apps/runtime/src/routes/wizard-stream.ts`, `apps/web/src/studio/live.tsx` |
| Claude Code plugin template | `plugin/`, `apps/runtime/src/plugin.ts` |
| Share sheet and shared result page | `apps/web/src/share/` |
| Changelog and open-source credits: generated from the commits and the dependencies, shown in the studio's footer | `cliff.toml`, `scripts/release.mjs`, `scripts/write-about-data.mjs`, `apps/web/src/about/` |
