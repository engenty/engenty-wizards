---
title: Command line
description: The wizards command — start, setup, status, update — and the install's settings file.
version: 0.3.2
---

## Commands

| Command | Does |
|---|---|
| `wizards` | What runs, and a menu: open the studio, restart and stop while it runs, "Start as service" or "Start here" (in this terminal) while it does not; update, which restarts what runs into the new version; "Service settings" (start at login); connect AI apps, status, setup, help. The first time, the setup runs first. Needs a terminal |
| `wizards start` | Starts it and opens the studio. It runs in that terminal; Ctrl-C stops it. The first time, the setup runs first |
| `wizards studio` | Opens the studio in your browser. When it does not run, it starts as a service first |
| `wizards setup` | The guided setup again: an AI client to think with, the browser and ffmpeg, start at login, your AI apps |
| `wizards open` | Lets this browser into the running studio. `--print` only shows the link; it works once, within a minute |
| `wizards status` | What is installed and what runs, with the browser the app uses for PDF, PNG and websites |
| `wizards doctor` | Status, and what is wrong |
| `wizards logs [n]` | The last lines the running install printed (100, or `n` up to 2000); keys and tokens are taken out |
| `wizards report` | Sends status, model settings (never a key) and the last 500 log lines to your [linked account](./models.md#account), so support can look at what went wrong. Nothing is sent unless you run it. The command names the report's id; without a linked account it says to link one under Settings → Account |
| `wizards stop` | Stops it. The data is kept |
| `wizards restart` | Stops it and starts it again; after an update, the new version. When it does not run, it starts as a service |
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
| `--service`, `-s` | Starts it as a service: detached from the terminal, and the command returns. `wizards stop` stops it; its output goes to `logs/runtime.log` |
| `--version`, `--help` | |

Started in a terminal, it runs while that terminal is open; Ctrl-C stops it. With
`wizards start --service` it keeps running after the terminal closes. If it already
runs, `wizards start` opens the running one instead of starting a second.

## Where things are

| Path | Holds |
|---|---|
| `~/.engenty/wizards` | The install. `ENGENTY_HOME` moves `~/.engenty` |
| `~/.engenty/wizards/data` | Your wizards, results and files. See [Your data](./data.md) |
| `~/.engenty/wizards/.env` | The settings file |
| `~/.engenty/wizards/plugins` | [Plugins](./plugins.md) of this install |
| `~/.engenty/wizards/logs` | Logs: `install.log`, `update.log`, `runtime.log` when it runs as a service, `autostart.log` when a Mac starts it at login |
| `~/.engenty/wizards/tools`, `runtime` | Its own Node.js, and the app |
| `~/.engenty/wizards/bin/wizards` | The command; `~/.local/bin/wizards` links to it |

## Settings

Most settings are in the studio. The settings file `~/.engenty/wizards/.env` holds what the
studio does not: one `NAME=value` per line. Restart after a change.

| Setting | Does | Default |
|---|---|---|
| `APP_URL` | The address you open. Links and sign-ins use it | `http://localhost:24368` |
| `API_PORT` | The port | `24368`; if taken, the next free one up to `24387` |
| `CHROME_PATH` | The browser for PDF and PNG exports and steps on websites: Chrome, Edge, Chromium or Brave | The first one found: on a Mac Google Chrome, Microsoft Edge, Chromium, Brave in `/Applications` or `~/Applications`; on Linux `google-chrome`, `chromium`, `chromium-browser`, `microsoft-edge` on the PATH. `wizards status` names it |
| `FFMPEG_PATH` | ffmpeg for MP4 videos | `ffmpeg` |
| `OLLAMA_URL` | Where Ollama answers | `http://127.0.0.1:11434/v1` |
| `PLUGINS_DIR` | Folders with plugins, comma-separated. Set, it replaces the default | `~/.engenty/wizards/plugins` |
| `PLUGINS_WATCH` | `0`: plugins no longer load again when their files change | `1` |
| `GEOCODER_URL` | Names the place of a location (street, town). Unset, a location is coordinates only and no position leaves your computer | unset |
| `LIMIT_DEFAULT_DAILY_RUNS` | Runs a day a shared link allows unless the wizard says otherwise | `50` |
| `LIMIT_VISITOR_RUNS_PER_HOUR` | Runs an hour one visitor can start | `6` |
| `RESULT_TTL_DAYS` | Days the result of a run over a wizard's link is kept | `7` |
| `STORE_TTL_DAYS` | Days what a wizard keeps for a person stays when unused | `400` |

The OAuth clients of the built-in connectors go here too: see [Connectors](./connectors.md).
Every setting, with what it is for, is in
[.env.example](https://github.com/engenty/wizards/blob/main/.env.example).

The command line hands the app only a short list of your terminal's variables. A key your shell
exports for another project does not reach it: put it into the settings file, or enter it in
the studio.
