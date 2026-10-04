# Developing engenty wizards

For working on the code. To install and use engenty wizards, see the [README](../README.md).

## Two ways to run it

| | Alone | Managed |
|---|---|---|
| What | one person, one tenant, on this machine: the local install (`engenty-wizards`), `pnpm dev`, your own server | the runtime of a Manage-App (`MANAGE_URL`): many tenants |
| Sign-in | a one-time link at start (the command line opens it itself); an account is optional | at the Manage-App (OAuth 2.1 / OIDC); the token names user, tenant and role |
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
| `apps/runtime/src/cli/` | the `engenty-wizards` command of a local install: start, guided setup, status, update |
| `apps/web/public/wizards.sh` | the installer, served by every runtime at `/wizards.sh` |
| `bin/` | the entry of the `engenty-wizards` command |
| `scripts/` | `npm-package.mjs` (the npm package) |
| `packages/shared/` | types and schemas the server and the SPA both use |
| `plugin/` | the Claude Code plugin template |
| `deploy/` | the Chromium container of the cloud runtime |

`.env.local` and the data folder (`data/`) stay in the repo root; `pnpm dev` and `pnpm start`
run from there.

## Run locally

```bash
pnpm install
cp .env.example .env.local   # set AI_GATEWAY_API_KEY (or another key); DEV_LOGIN=1
pnpm dev                     # web on :5181, API on :24368
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

Addresses: the studio is `/studio/…` (`/studio/new`, `/studio/edit/<id>`, `/studio/settings`),
built with its files below it (`/studio/assets`, `/studio/icons`). A wizard's link is
`/w/<token>`, a shared result `/s/<token>`, the API `/api/…`. Of the root the server serves only
`/wizards.sh`, `/embed.js` and `/sw.js`, and sends `/` to `/studio/`; on engenty.ai the root is
the landing page and `/wizards/` the marketplace.

`.env.local` and `data/` in the repo root belong to `pnpm dev` and `pnpm start`. The installed
command (`pnpm wizards`, `engenty-wizards`) uses `~/.engenty/wizards` instead: see
[Local install](#local-install).

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

GitHub runs lint, typecheck, test and build on every push to `main`, every pull request and
every release tag (`.github/workflows/ci.yml`).

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
credits list what `package.json` files name.

The tag is what ships: it deploys the cloud runtime (see [Deploy](#deploy)) and publishes the
local install (see [Local install](#local-install)). A push to `main` without a tag runs the
checks and nothing else, so the cloud runtime and a fresh local install are the same release.
Always tag through `pnpm release`: a tag set by hand leaves the changelog files as they were.

## Deploy

Alone, on your own server: see [Run it on a server](../README.md#run-it-on-a-server) in the
README. One container: API + built SPA + Chromium, data on the `/data` volume.

Managed (the cloud runtime): `compose.cloud.yaml` runs the app and a separate Chromium
container that holds no secrets and reaches no database. On engenty.ai the proxy sends the
runtime only its own paths — `/studio`, `/api`, `/w`, `/s`, `/.well-known`, `/wizards.sh`,
`/embed.js`, `/sw.js` — and the rest of the host to the landing page and the marketplace. Set the `MANAGE_*` block, `GATEWAY_URL`,
`APP_SECRET`, the Turso and R2 variables. After a release every tenant database is migrated at
start; a new one migrates when it is first opened.

engenty's own cloud runtime deploys from the branch `deploy/runtime`. A release tag `v<version>`
on `main` runs the checks; when they are green the same workflow (`.github/workflows/ci.yml`)
moves that branch to the tag's commit, and the server deploys what the branch points at. A push
to `main` without a tag deploys nothing. To deploy a tag again, run the workflow by hand on that
tag. To go back to an older commit: `git push --force origin <commit>:deploy/runtime`.

## Local install

What people install is the package `engenty-wizards`, built like an npm package: the built
runtime, the built SPA, the plugin template and the `engenty-wizards` command, with the shared
package inside it. It is not on npm yet: the tarball is attached to the GitHub release
`v<version>`, and npm installs it from that address. It gets onto a machine through the
installer, which keeps their data in `~/.engenty/wizards/data` (`ENGENTY_HOME` moves `~/.engenty`):

| | Code | Node |
|---|---|---|
| `curl -fsSL https://engenty.ai/wizards.sh \| bash` | `~/.engenty/wizards/runtime` | its own, pinned, in `~/.engenty/wizards/tools` |

Once the package is on npm (the repository variable `PUBLISH_NPM`, below), `npx engenty-wizards`
is a second way: the code in npm's cache, on the person's own Node 24.11 or newer.

```bash
pnpm package                       # node scripts/npm-package.mjs → dist/npm/engenty-wizards-<version>.tgz
pnpm wizards status                # the command from the checkout (node bin/engenty-wizards.mjs)
```

`scripts/npm-package.mjs` stages `apps/runtime/dist`, `apps/web/dist`, `plugin/` and `bin/` in the
checkout's layout and writes the package.json: the runtime's dependencies at the exact versions
of the root lockfile, the shared package bundled. Dependencies of dependencies are resolved by
npm at install time.

`apps/web/public/wizards.sh` is the installer (bash 3.2, `shellcheck` clean). It downloads the
pinned Node from nodejs.org and checks it against `SHASUMS256.txt`, asks GitHub for the newest
release, installs that release's tarball with that Node's npm
(`--ignore-scripts --legacy-peer-deps`), writes the command to
`~/.engenty/wizards/bin` and links it into `~/.local/bin`, then hands over to
`engenty-wizards setup`. The setup (`apps/runtime/src/cli/setup.ts`) asks; the script does not.
It lives in the SPA's `public/` folder, so every runtime serves it — `engenty.ai` included.

To try the installer against a checkout, without npm and without touching `~/.engenty`:

```bash
pnpm package
ENGENTY_HOME=/tmp/engenty-try ENGENTY_WIZARDS_PACKAGE=$PWD/dist/npm/engenty-wizards-<version>.tgz \
  bash apps/web/public/wizards.sh --no-link
```

How the pieces share one install:

- The runtime leaves `running.json` in its data folder while it runs (`apps/runtime/src/running.ts`).
  The command line looks there before starting one, and open the running one
  instead: two runtimes would write the same databases.
- Entering a runtime that already runs needs no restart: `engenty-wizards open` signs a ticket
  for `/api/local/enter` with the data folder's secret (`apps/runtime/src/auth/local-ticket.ts`),
  good for a minute and for one use. Who can read that secret can already make the studio's cookie.
- The command line starts the runtime with a short list of the terminal's variables
  (`apps/runtime/src/cli/environment.ts`); everything else comes from `~/.engenty/wizards/.env`.
  A key or a database address the shell exports for another project does not reach it.
- AI clients the setup installs from npm go into `~/.engenty/wizards/clients`; its `bin` and the
  install's Node are first on the runtime's PATH.

A release is a tag `v<version>` (the version of the root package.json):
`.github/workflows/release.yml` packs the package, runs the installer with it on Linux and
macOS, and attaches the tarball to the GitHub release.
With the repository variable `PUBLISH_NPM=true` and the secret `NPM_TOKEN` it also publishes to
npm. The same tag deploys the cloud runtime, which puts the current `wizards.sh` on
`engenty.ai`. On a pull request the same workflow builds and tests everything and publishes
nothing.

## Desktop app

There is none in this repo. The studio is a web app with a manifest
(`apps/web/public/manifest.webmanifest`); Chrome and Edge install it as an app, and the studio
offers that in a banner (`apps/web/src/studio/InstallBanner.tsx`). The runtime still serves a
native window as a client: a page in such a window finds `window.engentyDesktop` and opens
links and the sign-in in the system browser (`apps/web/src/studio/LocalRuntime.tsx`,
`SignInPage.tsx`).

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

The wizards a person can start from on "new" are entries of the marketplace. The marketplace is
an app of its own (the entries, their search, the public gallery at `/wizards/` and each
entry's page); this runtime is one of its clients. What both sides implement is
[`docs/marketplace-contract.md`](marketplace-contract.md); `MARKETPLACE_URL` names the
marketplace (default `https://engenty.ai/wizards`, `off` = none).

- **Search**: the "new" page asks `GET /api/studio/marketplace`, and the runtime asks the
  marketplace live (`/api/v1/entries`) — words, use case, industry, result, one page at a time,
  with the filters' counts. The scoring is BM25 with prefixes and inflections, the scoring of
  engenty's `search-index` package (`packages/shared/src/marketplace-search.ts`, copied by
  `scripts/sync-engenty.mjs`); the marketplace answers with it, and so does the runtime when the
  marketplace does not answer within 5 s.
- **Offline**: the runtime keeps the marketplace's starters and the entries a person starred
  (`marketplace_cache` in the control database; stars are `marketplace_star` in the tenant's).
  At start and then hourly it asks `/api/v1/sync` for their hashes and fetches only what changed;
  a star is kept at once. Without a connection the "new" page searches what is kept and says so.
- **One entry**: the dialog asks `GET /api/studio/marketplace/:id`. The runtime reads the wizard
  with its own schema: the steps, what a run hands over and what it costs in credits (the
  formula of `credits/estimate.ts` at the gateway's prices, else at list prices).
- **Older apps**: an entry written in a newer definition version, or with anything this app's
  schema would drop, is listed as "needs a newer app" and cannot be started from.
- **Starting from an entry** (`/studio/new?starter=<id>`): the wizard and its workspace files come from the
  marketplace, else from what is kept. The wizard is a copy: `wizard.starter` and
  `wizard.starter_revision` say where it came from, later revisions of the entry do not touch it.
  The marketplace counts it.
- **MCP**: `list_starters` searches the marketplace (without a query: its starters),
  `get_starter` hands over an entry's wizard. The authoring guide's example is the runtime's own
  (`apps/runtime/src/authoring/example.ts`).

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
| Marketplace client: search, one entry, stars, what is kept offline | `docs/marketplace-contract.md`, `packages/shared/src/{marketplace,marketplace-search,marketplace-entry}.ts`, `apps/runtime/src/services/marketplace.ts`, `apps/runtime/src/routes/marketplace.ts`, `apps/web/src/studio/Marketplace.tsx` |
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
