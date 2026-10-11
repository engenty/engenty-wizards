---
title: AI apps
description: Run and build your wizards inside Claude Desktop, Cursor, Codex and other AI apps.
version: 0.2.50
---

Settings → Integrate brings your wizards to where you work. engenty wizards is an MCP server:
an AI app that adds it gets the tools to find, run and build wizards. Under "Share" the same page
has the WordPress plugin: see [WordPress](./wordpress.md).

## What an app can do

| In the chat | How |
|---|---|
| Run a wizard | "Start one of my engenty wizards." The app asks the wizard's questions, shows the review and hands over the downloads. Only published wizards run |
| See the wizard itself | Apps that show MCP Apps show the wizard as a widget, page by page, and you answer there |
| Build a wizard | "Use engenty wizards to build a wizard that reads amount, date and sender from an invoice PDF." |
| Change one | Create, change and publish wizards, find templates and connectors, read and write a wizard's files |

- A run in a chat spends what any run of the wizard spends, and so does a test run.
- What a chat cannot fill in — files, recordings, signatures, line items — is done on the run's
  page in the browser. The app hands you the link.
- What an app writes shows up live in an open editor, marked with the app's name.

## Apps

| App | Shows the wizard as a widget | Name for the command |
|---|---|---|
| Claude Desktop | yes | `claude-desktop` |
| Claude Code | no, a run comes as text | `claude-code` |
| Codex · ChatGPT app | no | `codex` |
| Cursor | yes | `cursor` |
| VS Code (Copilot) | yes | `vscode` |
| Windsurf | no | `windsurf` |
| Gemini CLI | no | `gemini` |
| Goose | yes | `goose` |
| OpenClaw | no | `openclaw` |
| LM Studio | no | `lm-studio` |
| claude.ai, ChatGPT | yes | not on your computer, see below |

## Add an app

Settings → Integrate opens on the apps found on this computer, each with one button and where it
stands: works, added but not tested yet, or not set up. The dots in the menu say the same.

Pick an app and follow its numbered steps:

1. **Add to …** writes engenty wizards into the app's settings. No key, no port: the app starts
   engenty wizards itself.
2. **Restart the app**, or reload its MCP servers. The page notices by itself when the app checks
   in.
3. **Try it in the chat**: "Which wizards do I have in engenty?"

Once the app has called a tool, the page says "Works" and offers first sentences to try, with your
own wizards' names.

From a terminal, the same as step 1:

```bash
wizards connect
```

That adds every AI app found on the computer. Name apps to add only those, and take one out
again with `disconnect`:

```bash
wizards connect cursor codex
wizards disconnect cursor
```

- The file an app's settings were in before is kept beside it as `<file>.before-engenty`.
- Quit Claude Desktop before you add it: it writes its settings from memory while it runs.
- A settings file that is not plain JSON is left alone. The command prints the entry to paste.

## An app on another computer

Under the steps, "Connect with the address and an API key" is for an app that runs elsewhere. The
API key is shown once and goes straight into the command or config entry the page shows.

- Each API key signs one app in and has every right: treat it like a password.
- The page lists the API keys with their last use. Delete one and that app is signed out.

## Apps on the web

claude.ai and ChatGPT connect from their makers' servers, and so do Claude Desktop's connectors.
They cannot reach your computer: for them your wizards run on engenty.ai.

- **From the cloud studio** the page walks through it: open the app's connector settings, enter
  the name and the address `https://engenty.ai/api/mcp`, click Connect, sign in at engenty and
  allow. No key.
- **From your computer** connect your engenty account first. The wizards you publish go to
  engenty.ai, and claude.ai connects there. Without an account, use Claude Desktop on this
  computer.

The consent page names the team the access is for and the address it goes back to. An app that
only named itself is marked "Name given by the app itself".

Disconnect an app under Account → Connected apps at engenty.ai. Its access ends within half a
minute, even with a token it already holds.

## The Claude Code plugin

With a public https address, Claude Code can also install a plugin. It adds the `/wizard`
command and the skills to build and to use wizards:

```bash
claude plugin marketplace add <your address>/api/claude-plugin/marketplace.json
claude plugin install engenty-wizards@engenty
```
