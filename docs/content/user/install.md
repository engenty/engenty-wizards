---
title: Install
description: One command on macOS or Linux. It brings its own Node.js and asks for no password.
version: 0.2.50
---

## Install

In a terminal, on macOS or Linux (arm64 or x64; on Windows, in WSL):

```bash
curl -fsSL https://engenty.ai/install.sh | bash
```

It needs nothing but `curl` and `tar`. It brings its own Node.js (a Node you already have is left
alone), installs engenty wizards into `~/.engenty/wizards` (about 650 MB), links the `wizards`
command into `~/.local/bin` and then walks you through the rest:

| Step | What it does |
|---|---|
| Something to think with | Looks for Codex, Claude Code, Gemini CLI and Cursor Agent and offers to install the ones that are missing. It proposes the one whose app (ChatGPT, Claude, Cursor) is on your Mac first, as that subscription is most likely yours already. You can also use an API key, [Ollama](https://ollama.com) or, on a Mac with Apple silicon and macOS 26, Apple Intelligence: the studio's [first page](./first-start.md) offers them |
| A browser and ffmpeg | Names the browser for PDF and PNG exports and steps on websites: the first of Chrome, Edge and Chromium it finds (on a Mac also Brave). The app uses that one; [`CHROME_PATH`](./command-line.md#settings) picks another. Says whether there is ffmpeg for MP4 videos of animated widgets; with Homebrew it offers to install it |
| Start at login (optional) | engenty wizards starts in the background when you log in, so links and AI clients always reach it. A LaunchAgent on a Mac, a systemd user service on Linux |
| Your AI apps (optional) | Offers to add your wizards to the [AI apps](./ai-apps.md) it finds, such as Claude Desktop, Cursor or Codex |
| The command | If `~/.local/bin` is not on your PATH, offers to add it in your shell's settings file |

It starts nothing. At the end it says whether it runs and how to start, stop and check it.
You install once; from then on you use the `wizards` command.

## Start, stop, check

| Command | Does |
|---|---|
| `wizards start` | Starts it and opens the studio. It runs while that terminal is open; Ctrl-C stops it |
| `wizards start -s` | Starts it as a service: the terminal stays free |
| `wizards studio` | Opens the studio; starts it as a service first if it does not run |
| `wizards stop` | Stops it. Your data is kept |
| `wizards status` | Whether it runs, and where |
| `wizards restart` | Stops it and starts it again |
| `wizards` | A menu with all of it |

The studio is at
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

This runs the installer again without its questions. If it runs, `wizards restart` then starts
the new version; the command says so. The studio also says in a banner at the top when a newer
release is out: "Update" there installs it and starts the new version. The About dialog, behind
the engenty mark in the app bar, shows the same. Your data is brought up to date at the next
start.

## Remove

```bash
wizards stop
wizards autostart off
wizards disconnect
```

`wizards disconnect` takes your wizards out of your AI apps again. Then delete `~/.engenty/wizards`
and `~/.local/bin/wizards`. Your wizards and results are in `~/.engenty/wizards/data`:
[back that folder up](./data.md) first if you want to keep them.
