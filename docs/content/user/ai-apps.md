---
title: AI apps
description: Run and build your wizards inside Claude Desktop, Cursor, Codex and other AI apps.
---

Settings → Integrate brings your wizards to where you work. engenty wizards is an MCP server:
an AI app that adds it gets the tools to find, run and build wizards.

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

Pick the app on the Integrate page. "Where does the app run?" has two answers:

| | On this computer | At the address |
|---|---|---|
| For | An app on the computer engenty wizards is installed on | An app anywhere the address can be reached |
| Sign-in | None. No key, no port | A key |
| How | "Add to …" writes engenty wizards into the app's settings | The page shows the command or the config entry to paste |
| Needs | Nothing running: the app starts engenty wizards itself | engenty wizards running at that address |

From a terminal, the same as "On this computer":

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

## Test it

"Test" on the app's panel waits for three things and ticks each off:

1. **The app checks in.** Quit the app completely and start it again, or reload its MCP servers.
2. **It called a tool.** In a new chat, write: "Which wizards do I have in engenty?"
3. **It showed the wizard as a widget**, in apps that can. Write: "Start one of my engenty
   wizards."

## Apps on the web

claude.ai and ChatGPT connect from their makers' servers. They cannot reach your computer: for
them a wizard runs on engenty.ai. There they sign in in the browser on first use; no key. On
your computer, use "On this computer" or an app that runs there.

## Keys

"At the address" signs an app in with a key. The key is shown once and goes straight into the
command the page shows.

- Each key signs one app in and has every right: treat it like a password.
- The page lists the keys with their last use. Delete a key and that app is signed out.

## The Claude Code plugin

With a public https address, Claude Code can also install a plugin. It adds the `/wizard`
command and the skills to build and to use wizards:

```bash
claude plugin marketplace add <your address>/api/claude-plugin/marketplace.json
claude plugin install engenty-wizards@engenty
```
