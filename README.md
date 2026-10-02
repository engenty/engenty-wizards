# engenty wizards

Describe a flow in plain words, get an AI wizard, share it with a link. End users walk it
page by page; AI steps research the web, write, draw images, render video, build
documents and dashboards, or write into other systems over MCP, HTTP or a browser.
Results download as PDF, Word, HTML, Markdown, PNG, MP4, CSV, Excel or JSON. Interactive
widgets (maps, timelines with a scrubber, dashboards) are written once into the wizard's
workspace and only get new data per run. Anyone can share a finished result as a link
(`/s/<token>`); results of end users without an account are kept 7 days.

## Run locally

```bash
pnpm install
cp .env.example .env.local   # set AI_GATEWAY_API_KEY and BETTER_AUTH_SECRET; DEV_LOGIN=1
pnpm dev                     # web on :5181, API on :8891
```

With Portless: `portless alias wizards 5181`, set `APP_URL=https://wizards.localhost`, open
https://wizards.localhost. "Dev-Login" signs you in without OAuth (local only).

Local Chrome renders PDFs/PNGs (`CHROME_PATH`), ffmpeg encodes widget animations to MP4
(`FFMPEG_PATH`); the shell/code tool needs Docker and the `engenty-sandbox` image.

## Checks

```bash
pnpm fix && pnpm lint && pnpm typecheck && pnpm test && pnpm build
node scripts/e2e-starter.mjs invoice '<answers json>'   # drive a starter end to end via the API
```

## Deploy

```bash
cp .env.example .env    # fill the required block, a sign-in provider, Stripe if billing
docker compose up -d --build
```

One container: API + built SPA + Chromium, data (libSQL file + assets) on the `/data`
volume. Put a TLS proxy in front of port 8891. Auth callbacks:
`<APP_URL>/api/auth/callback/<google|github|microsoft>`; Stripe webhook:
`<APP_URL>/api/billing/webhook`.

## Accounts people connect

A wizard can ask the person running it to connect their mailbox; steps then read it (never write).
IMAP works without any setup. For "Gmail" and "Outlook" buttons, give the OAuth client you already
use for sign-in one more redirect URI, `<APP_URL>/api/connect/callback`, and

- Google: enable the Gmail API and add the scope `gmail.readonly` to the consent screen
- Microsoft: add the delegated permission `Mail.Read`

Connected accounts, kept sign-ins, lists and collected files belong to one wizard and one person,
are encrypted where secret (`STORE_ENC_KEY`), and go when unused for `STORE_TTL_DAYS`.

## Connectors

In the project settings, search a service (Notion, Stripe, GitHub …) in the
[integrations.sh](https://integrations.sh) registry and import it — from its OpenAPI spec or its
MCP server. The architect and MCP clients can do the same (`find_connectors`, `import_connector`).
A wizard declares a connection to it; the person running the wizard connects their own account
(OAuth, with the client registered on the fly where the server allows it, or an API key). Steps
get the connector's actions as tools: reading is allowed, anything that changes the account asks
the person first, deleting always. `ENGENTY_INTEGRATIONS_REGISTRY_URL` points at another registry.

## Build wizards from your own AI client

Admins can author wizards in Claude Code, Codex, Cursor, claude.ai or Claude Desktop, on their own
subscription. The MCP endpoint is `<APP_URL>/api/mcp`. Clients sign in with OAuth 2.1: discovery,
dynamic registration or a client metadata document, then a consent page in the studio. Settings →
"Mit Claude Code & Co. bauen" shows the setup for each client, lists connected apps (with
"Trennen") and issues API keys for scripts.

```bash
# Claude Code: plugin with the /wizard command (needs a public https APP_URL)
claude plugin marketplace add <APP_URL>/api/claude-plugin/marketplace.json
claude plugin install engenty-wizards@engenty
# or just the server
claude mcp add --transport http --scope user engenty-wizards <APP_URL>/api/mcp
# Codex
codex mcp add engenty-wizards --url <APP_URL>/api/mcp && codex mcp login engenty-wizards
```

The plugin is built from `plugin/` with this deployment's `APP_URL` filled in (`server/plugin.ts`).
Test runs that a client starts spend the admin's credits. Writes from a client show up live in an
open editor.

## How it is built

| Part | Where |
|---|---|
| Wizard definition (zod) + validator | `shared/definition.ts` |
| Step runner (cursor over the definition, pages / back / regenerate / branches) | `server/engine/runner.ts` |
| Agent + generate steps (Mastra Agent, AI SDK media) | `server/engine/steps.ts` |
| Agent tools: web search/fetch, sandbox, HTTP, image, MCP | `server/tools/index.ts` |
| Browser tools: open/click/type, screenshot, sign-in handed to the person, downloads | `server/tools/browser.ts`, `server/engine/asks.ts` |
| What a wizard keeps per person: lists, files, connected accounts, sign-ins | `shared/store.ts`, `server/store/`, `server/tools/store.ts` |
| Mail connectors (Gmail, Outlook, IMAP) in engenty's connector format | `server/connectors/`, `server/tools/mail.ts` |
| Imported connectors: any service from the integrations.sh registry, by its OpenAPI spec or MCP server | `server/connectors/external.ts`, `server/tools/connector.ts`, `web/src/studio/Connectors.tsx` |
| Document reading (PDF, scans and photos, Word, Excel, CSV, mails) and invoice fields | `server/documents/parse.ts` |
| engenty framework code, copied unchanged (`node scripts/sync-engenty.mjs`) | `server/engenty/`, `shared/engenty/` |
| Architect (prompt → wizard, self-repairing) | `server/agents/architect.ts` |
| Widgets: bundle (code + data → one HTML), `window.wizard` runtime, PNG/PDF/MP4 export | `server/widgets/` |
| Workspace files (content-addressed blobs, snapshots per version and run) | `server/services/files.ts`, `server/blobs.ts` |
| Shared results, link previews, 7-day retention | `server/services/shares.ts`, `server/link-preview.ts` |
| Starter wizards | `server/starters/index.ts` |
| Models + pricing (Vercel AI Gateway first, vendor keys as fallback) | `server/models.ts` |
| Credits + Stripe | `server/billing/` |
| Studio (editor, diagram, chat, inspector) | `web/src/studio/` |
| Public runner | `web/src/runner/` |
| MCP server for authoring (tools, OAuth/API-key gate) | `server/mcp/`, `server/auth.ts` |
| Live editor (SSE stream, merge of concurrent edits) | `server/routes/wizard-stream.ts`, `web/src/studio/live.tsx` |
| Claude Code plugin template | `plugin/`, `server/plugin.ts` |
| Share sheet and shared result page | `web/src/share/` |

Decisions and status: `../PLAN-engenty-wizards.md`.
