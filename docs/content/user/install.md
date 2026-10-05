---
title: Install
description: One command on macOS or Linux. It brings its own Node.js and asks for no password.
---

## Install

In a terminal, on macOS or Linux:

```bash
curl -fsSL https://engenty.ai/install.sh | bash
```

It needs nothing but `curl`. It brings its own Node.js (a Node you already have is left alone),
installs engenty wizards into `~/.engenty/wizards` and then walks you through the rest:

| Step | What it does |
|---|---|
| Something to think with | Looks for Codex, Claude Code, Gemini CLI and Cursor Agent and offers to install one if there is none. It proposes the one whose app (Claude, ChatGPT, Cursor) is on your Mac first, as that subscription is most likely yours already. You can also use an API key or [Ollama](https://ollama.com) |
| Google Chrome and ffmpeg (optional) | Chrome makes PDF and PNG exports and runs steps that use a browser. ffmpeg makes MP4 videos of animated widgets |
| Start at login (optional) | engenty wizards starts in the background when you log in, so links and AI clients always reach it. A LaunchAgent on a Mac, a systemd user service on Linux |

Then it starts, and the studio opens in your browser.

## Start it

```bash
wizards
```

It runs while that terminal is open; Ctrl-C stops it. The studio is at
`http://localhost:24368/studio/`. The link the command opens signs this browser in; it works
once. For another browser, see [`wizards open`](./command-line.md).

If the command is not found, open a new terminal or run `~/.local/bin/wizards`.

## Install it as an app

In Chrome or Edge the studio installs as an app with its own window and its own icon in the Dock
or taskbar. The studio offers it in a banner at the top; or click the install icon at the right
of the address bar.

## Other ways to get it

| Way | For |
|---|---|
| `npx wizards` | Trying it on your own Node.js 24.11 or newer, without the installer |
| [From source](https://github.com/engenty/engenty-wizards#from-source) | Working on the code |
| [Docker](./server.md) | A server others can reach |

## Update

```bash
wizards update
```

This runs the installer again without its questions. The studio also says when a newer release
is out and can run the same update from its footer. Your data is brought up to date at the next
start.

## Remove

```bash
wizards autostart off
```

Then delete `~/.engenty/wizards` and `~/.local/bin/wizards`. Your wizards and results are in
`~/.engenty/wizards/data`: [back that folder up](./data.md) first if you want to keep them.
