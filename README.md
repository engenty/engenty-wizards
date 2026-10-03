<p align="center">
  <img src="docs/assets/engenty.svg" width="96" alt="">
</p>

<h1 align="center">engenty wizards</h1>

<p align="center">
  For the tasks that keep coming back. Describe them once, engenty builds the wizard.<br>
  The AI does the work and asks back when needed.
</p>

<p align="center">
  <img src="docs/assets/setup.png" alt="The first start of engenty wizards: choose the engine it thinks with — Codex, Claude Code, Gemini CLI, Cursor Agent or your own keys">
</p>

## What it does

- **Describe it, get a wizard.** Say in plain words what you do again and again — a post with
  an image, a research briefing, an invoice, a quote, a damage report — and engenty builds a
  wizard for it: pages that ask what it needs, AI steps that do the work.
- **AI steps do the work.** They research the web, write, draw images, render video, read PDFs,
  scans and mails, build documents and dashboards, and write into other services over MCP, HTTP
  or a browser. Anything that changes an account asks first.
- **Share it with a link.** Anyone can run a wizard in the browser, on a phone too: camera,
  code scan, voice notes, location and a drawn signature included. Results download as PDF,
  Word, HTML, Markdown, PNG, MP4, CSV, Excel or JSON, or go out as a link.
- **Runs on your machine, on your subscription.** It thinks with Codex, Claude Code, Gemini CLI
  or Cursor Agent when one is installed and signed in, so no API key is needed. Or bring a key
  (Vercel AI Gateway, OpenAI, Anthropic), or a local model through Ollama. Your wizards and
  results stay in a folder on your machine.

## Install

You need:

| | |
|---|---|
| macOS or Linux | |
| [Node.js](https://nodejs.org) 24.11 or newer | check with `node -v` |
| pnpm 10 | `corepack enable`, or `npm install -g pnpm` |
| Something to think with | Codex, Claude Code, Gemini CLI or Cursor Agent, signed in — or an API key, or [Ollama](https://ollama.com) |
| Google Chrome (optional) | for PDF and PNG exports and for steps that use a browser |
| ffmpeg (optional) | for MP4 videos of animated widgets |

Get it and build it:

```bash
git clone https://github.com/engenty/engenty-wizards.git
cd engenty-wizards
pnpm install
pnpm build
```

pnpm may list "Ignored build scripts" — that's expected, nothing to do.

Start it:

```bash
pnpm start
```

It prints a link:

```text
engenty wizards on :8891 — http://localhost:8891
Open the studio: http://localhost:8891/api/local/enter?k=…
```

Open that link in your browser. It lets this browser in and works once; if you lose the
session, restart and open the new link.

Code steps (shell, Node, Python) run in a sandbox inside engenty wizards; nothing to set up.

## First start

The setup asks what engenty should think with. Pick an AI client that is installed on your
computer — engenty uses your existing subscription and signs it in for you in a terminal right
on the page — or enter your own keys. It stays until a test call works, then the studio opens.

Change it later under Settings.

## Using it

- **Make a wizard:** describe it in the studio's chat, or start from one of the starters.
  You see the steps as a diagram and can change any of them.
- **Run and share:** try it yourself, then share the link. Shared results are kept for 7 days
  for people without an account.
- **Connect services:** Gmail, Google Drive, Calendar, Contacts, Outlook, OneDrive, Slack,
  GitHub, HubSpot and S3 are built in; any other service can be added from its API description
  or MCP server through the [integrations.sh](https://integrations.sh) registry. Services that
  sign in with OAuth need a few settings first: [Connectors](docs/development.md#connectors).
- **Build from Claude Code or Codex:** Settings → "Build with Claude Code & co." creates a key
  and shows the command to add engenty wizards to your AI client.

Your machine only answers on `localhost`. To let others open shared wizards, run it on a server.

## Your data

Everything lives in the `data` folder next to the code: the databases, the files of your
wizards and results, and the keys you enter (encrypted). Back up that folder; delete it to
start over. `DATA_DIR` in `.env` moves it.

## Update

```bash
git pull
pnpm install
pnpm build
```

Then start it again. Your data is brought up to date at start.

## Run it on a server

With Docker, behind an https proxy (Caddy, Traefik, Coolify):

```bash
git clone https://github.com/engenty/engenty-wizards.git
cd engenty-wizards
cp .env.example .env    # set APP_URL to your https address and add a model key
docker compose up -d --build
docker compose logs     # shows the link to open once
```

Point the proxy at port 8891. On a server, engenty thinks with your keys or Ollama; the
AI clients' subscriptions live on your own computer. The code sandbox is off in this image.

## Mac app

A Mac app that brings everything along is on its way. It isn't signed yet, so it isn't offered
for download here.

## Troubleshooting

| | |
|---|---|
| "This link is no longer valid" | The link works once. Restart and open the new one. |
| You open it under another address | Set `APP_URL` in a `.env` file to the address you open. |
| An AI client shows as not signed in | Sign it in on the setup page, or in your own terminal (e.g. `claude`, `codex login`), then "Check again". |
| PDF or PNG export fails | Install Google Chrome, or set `CHROME_PATH` to Chrome or Chromium. |
| Port 8891 is taken | Set `API_PORT` in a `.env` file, e.g. `API_PORT=8900`. |

More settings: [.env.example](.env.example).

## For developers

Development server, checks, how it is built, the managed mode and the desktop app:
[docs/development.md](docs/development.md).

## License

[FSL-1.1-MIT](LICENSE): use it for yourself and your company, run it, change it — just don't
offer it to others as a competing product or service. Each release becomes MIT two years
after it is published.
