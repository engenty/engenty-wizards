---
title: Troubleshooting
description: What to do when a link is no longer valid, a client shows as not signed in, or an export fails.
---

`wizards doctor` checks the install and says what is wrong. Start there.

## Starting and signing in

| What you see | Do |
|---|---|
| "This link is no longer valid" | The link works once. `wizards open` gives this browser a new one |
| `wizards`: command not found | Open a new terminal, or run `~/.local/bin/wizards` |
| The sign-in page instead of the studio | This browser is not signed in to the install. Run `wizards open` |
| You open it under another address | Set `APP_URL` in `~/.engenty/wizards/.env` to the address you open |
| Port 24368 is taken | The next free port is used. To fix one, set `API_PORT` in `~/.engenty/wizards/.env` |

## Models

| What you see | Do |
|---|---|
| An AI client shows as not signed in | Sign it in on the setup page or under Settings → Models, or in your own terminal (`claude`, `codex login`). Then "Check again" |
| "Signed in with an API key from your shell" | The client runs on that key, not on your subscription. "Sign in here" switches it |
| The test does not work | The message names the reason. Check the key, or sign the client in again |
| "Models are missing" in the editor | A step needs a model this install has no way to, often video or audio. Add a key under Settings → Models |
| A template says "Not set up here" | The same: it needs a model that is not set up |

## Running wizards

| What you see | Do |
|---|---|
| PDF or PNG export fails | Install Google Chrome, or set `CHROME_PATH` to Chrome or Chromium |
| A widget offers no video | Install ffmpeg, or set `FFMPEG_PATH` |
| "This wizard is not available right now" | The link is switched off, or the account the wizard runs on has no credits left. See [Test and share](./test-and-share.md) |
| The wizard says its limit is reached for today | The link's runs for the day are used up. Raise "Runs per day" in the share dialog |
| "This wizard does not exist (anymore)" | It is not published, or its link was replaced by a new one |
| Others cannot open the link | An install on your computer answers on `localhost` only. See [who can open the link](./test-and-share.md#who-can-open-the-link) |
| The camera, microphone or location does not work | Allow it in the browser's site settings (the lock icon in the address bar) |
| A connector says "not set up" | The install needs an OAuth client for it. See [Connectors](./connectors.md) |
| A step stops at a plugin's tool | That plugin is not installed here. See [Plugins](./plugins.md) |

## Updating

| What you see | Do |
|---|---|
| "The update failed" | The reason is in `~/.engenty/wizards/logs/update.log`. Run `wizards update` in a terminal to see it live |
| A template "Needs a newer app" | Update: `wizards update` |

## Still stuck

Open an issue at [github.com/engenty/engenty-wizards](https://github.com/engenty/engenty-wizards/issues)
with what `wizards doctor` prints.
