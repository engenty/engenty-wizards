---
title: Command line
description: The wizards command — start, setup, status, update — and the install's settings file.
---

## Commands

| Command | Does |
|---|---|
| `wizards` or `wizards start` | Starts it and opens the studio. The first time, the setup runs first |
| `wizards setup` | The guided setup again: an AI client to think with, ffmpeg, start at login |
| `wizards open` | Lets this browser into the running studio. `--print` only shows the link |
| `wizards status` | What is installed and what runs |
| `wizards doctor` | Status, and what is wrong |
| `wizards stop` | Stops it. The data is kept |
| `wizards update` | Installs the newest version |
| `wizards autostart on` / `off` | Starts it at login, or no longer. A LaunchAgent on macOS, a systemd user service on Linux |
| `wizards connect [app …]` | Adds your wizards to your [AI apps](./ai-apps.md): every app found, or the ones you name |
| `wizards disconnect [app …]` | Takes them out again |
| `wizards mcp` | The MCP server over stdio. AI apps start it; you do not |

| Option | Does |
|---|---|
| `--yes`, `-y` | Asks nothing and installs nothing optional |
| `--client <name>` | Installs this AI client without asking: `codex`, `claude`, `gemini`, `cursor` |
| `--no-open` | Starts without opening the browser |
| `--version`, `--help` | |

Started in a terminal, it runs while that terminal is open; Ctrl-C stops it. If it already
runs, `wizards` opens the running one instead of starting a second.

## Where things are

| Path | Holds |
|---|---|
| `~/.engenty/wizards` | The install. `ENGENTY_HOME` moves `~/.engenty` |
| `~/.engenty/wizards/data` | Your wizards, results and files. See [Your data](./data.md) |
| `~/.engenty/wizards/.env` | The settings file |
| `~/.engenty/wizards/plugins` | [Plugins](./plugins.md) of this install |
| `~/.engenty/wizards/logs` | Logs: `update.log`, and `runtime.log` when an AI app started it |
| `~/.local/bin/wizards` | The command |

## Settings

Most settings are in the studio. The settings file `~/.engenty/wizards/.env` holds what the
studio does not: one `NAME=value` per line. Restart after a change.

| Setting | Does | Default |
|---|---|---|
| `APP_URL` | The address you open. Links and sign-ins use it | `http://localhost:24368` |
| `API_PORT` | The port | `24368`; the next free one if taken |
| `CHROME_PATH` | Chrome or Chromium for PDF and PNG exports and browser steps | The installed Google Chrome |
| `FFMPEG_PATH` | ffmpeg for MP4 videos | `ffmpeg` |
| `OLLAMA_URL` | Where Ollama answers | `http://127.0.0.1:11434/v1` |
| `PLUGINS_DIR` | Folders with plugins, comma-separated | `~/.engenty/wizards/plugins` |
| `PLUGINS_WATCH` | `0`: plugins no longer load again when their files change | `1` |
| `GEOCODER_URL` | Names the place of a location (street, town). Unset, a location is coordinates only and no position leaves your computer | unset |
| `LIMIT_DEFAULT_DAILY_RUNS` | Runs a day a shared link allows unless the wizard says otherwise | `50` |
| `LIMIT_VISITOR_RUNS_PER_HOUR` | Runs an hour one visitor can start | `6` |
| `RESULT_TTL_DAYS` | Days the result of a run over a wizard's link is kept | `7` |
| `STORE_TTL_DAYS` | Days what a wizard keeps for a person stays when unused | `400` |

The OAuth clients of the built-in connectors go here too: see [Connectors](./connectors.md).
Every setting, with what it is for, is in
[.env.example](https://github.com/engenty/engenty-wizards/blob/main/.env.example).

The command line hands the app only a short list of your terminal's variables. A key your shell
exports for another project does not reach it: put it into the settings file, or enter it in
the studio.
