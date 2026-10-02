# engenty wizards

Describe a flow in plain words, get an AI wizard, share it with a link. End users walk it
page by page; AI steps research the web, write, draw images, render video, build
documents and dashboards, or write into other systems over MCP, HTTP or a browser.
Results download as PDF, Word, HTML, Markdown, PNG, MP4, CSV, Excel or JSON.

## Run locally

```bash
pnpm install
cp .env.example .env.local   # set AI_GATEWAY_API_KEY and BETTER_AUTH_SECRET; DEV_LOGIN=1
pnpm dev                     # web on :5181, API on :8891
```

With Portless: `portless alias wizards 5181`, set `APP_URL=https://wizards.localhost`, open
https://wizards.localhost. "Dev-Login" signs you in without OAuth (local only).

Local Chrome renders PDFs/PNGs (`CHROME_PATH`); the shell/code tool needs Docker and the
`engenty-sandbox` image.

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

## How it is built

| Part | Where |
|---|---|
| Wizard definition (zod) + validator | `shared/definition.ts` |
| Step runner (cursor over the definition, pages / back / regenerate / branches) | `server/engine/runner.ts` |
| Agent + generate steps (Mastra Agent, AI SDK media) | `server/engine/steps.ts` |
| Agent tools: web search/fetch, browser, sandbox, HTTP, image, MCP | `server/tools/index.ts` |
| Architect (prompt → wizard, self-repairing) | `server/agents/architect.ts` |
| Starter wizards | `server/starters/index.ts` |
| Models + pricing (Vercel AI Gateway first, vendor keys as fallback) | `server/models.ts` |
| Credits + Stripe | `server/billing/` |
| Studio (editor, diagram, chat, inspector) | `web/src/studio/` |
| Public runner | `web/src/runner/` |

Decisions and status: `../PLAN-engenty-wizards.md`.
