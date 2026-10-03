# engenty wizards

Describe a flow in plain words, get an AI wizard, share it with a link. End users walk it
page by page; AI steps research the web, write, draw images, render video, build
documents and dashboards, or write into other systems over MCP, HTTP or a browser.
Results download as PDF, Word, HTML, Markdown, PNG, MP4, CSV, Excel or JSON. Interactive
widgets (maps, timelines with a scrubber, dashboards) are written once into the wizard's
workspace and only get new data per run. Anyone can share a finished result as a link
(`/s/<token>`); results of end users without an account are kept 7 days.

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
the two speak is in [docs/manage-contract.md](docs/manage-contract.md).

A step names a **model class** — `classifier`, `standard`, `high`, `highest`, plus `image`,
`video`, `audio` — and an optional effort hint, never a model. Which model serves a class is
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
(`FFMPEG_PATH`). The shell/code tool runs in a sandbox per run, chosen with `SANDBOX`:
`docker` (default) needs Docker and the `engenty-sandbox` image; `agentos` runs an
[agentOS](https://rivet.dev/agentos/) VM inside the server process (macOS and glibc Linux, no
Docker) with a smaller toolset — sh, coreutils, node, npm, and Python as a separate tool without
pandas, pillow or matplotlib; `off` removes the tool. The agent is told what the chosen sandbox
runs (`apps/runtime/src/sandbox`).

A data folder from before tenants (`DATA_DIR/wizards.db`) is taken over into the local tenant at
the first start; the old file stays.

## Checks

```bash
pnpm fix && pnpm lint && pnpm typecheck && pnpm test && pnpm build
node scripts/e2e-starter.mjs invoice '<answers json>'   # drive a starter end to end via the API
```

`apps/runtime/test/tenants.test.ts` is the leak test: two tenants, two databases, nothing of one
visible to the other. `apps/runtime/test/managed.test.ts` runs the runtime against a stand-in
Manage-App.

## Deploy

Alone, on your own server:

```bash
cp .env.example .env    # APP_URL, a model key; put a TLS proxy in front of port 8891
docker compose up -d --build
```

One container: API + built SPA + Chromium, data on the `/data` volume. Set `API_HOST=0.0.0.0`
behind the proxy and open the link the container prints at start once.

Managed (the cloud runtime): `compose.cloud.yaml` runs the app and a separate Chromium
container that holds no secrets and reaches no database. Set the `MANAGE_*` block, `GATEWAY_URL`,
`APP_SECRET`, the Turso and R2 variables. After a release every tenant database is migrated at
start; a new one migrates when it is first opened.

## Desktop app

`apps/desktop/` is a Tauri 2 app (macOS first) that brings this runtime along as a Node sidecar on
the loopback interface and shows the studio in its window. Data lives in the app's data folder,
keys in the Keychain. An account is optional; sign-in runs in the system browser.

```bash
node scripts/desktop-bundle.mjs          # the runtime + production node_modules + Node
cd apps/desktop && pnpm tauri build --bundles app
```

Signing, notarization and the app's rules for what a page in its window may do:
[apps/desktop/README.md](apps/desktop/README.md).

## On a phone

A shared wizard (`/r/<token>`) is built for phones: sticky actions above the keyboard, camera
with several shots and clips, code scan, location, voice notes (transcribed by the `audio`
class before the next step), a drawn signature, the share sheet for results, a wake lock and a
notice when a long step ends, and its own home-screen entry. Each of these falls back to a file
picker or typed input where a browser lacks the API.

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
| Starter wizards | `apps/runtime/src/starters/index.ts` |
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

License: [FSL-1.1-MIT](LICENSE).
