---
title: Troubleshooting
description: What to do when a link is no longer valid, a client shows as not signed in, or an export fails.
version: 0.2.50
---

`wizards doctor` checks the install and says what is wrong. Start there.

## Starting and signing in

| What you see | Do |
|---|---|
| "This link is no longer valid" | The link works once. `wizards open` gives this browser a new one |
| "The app is not answering" | It stopped or is restarting. `wizards status` says whether it runs; `wizards start` starts it |
| `wizards`: command not found | Open a new terminal, or run `~/.local/bin/wizards` |
| "This browser is not signed in" | The browser has no sign-in for the install, for example after clearing cookies. Run `wizards open` |
| "The studio runs at another address" | Open the address the page names, or set `APP_URL` in `~/.engenty/wizards/.env` to the address you open |
| Port 24368 is taken | The next free port is used. To fix one, set `API_PORT` in `~/.engenty/wizards/.env` |

## Models

| What you see | Do |
|---|---|
| An AI client shows as not signed in | Sign it in on the setup page or under Settings → Models, or in your own terminal (`claude`, `codex login`). Then "Check again" |
| "Signed in with an API key from your shell" | The client runs on that key, not on your subscription. "Sign in here" switches it |
| The test does not work | The message names the reason. Check the key, or sign the client in again |
| "Models are missing" in the editor | A step needs a model this install has no way to, often video or audio. Add a key under Settings → Models |
| A template says "Not set up here" | The same: it needs a model that is not set up |
| No Apple Intelligence in the setup or under Models | It needs a Mac with Apple silicon on macOS 26 or later, and is offered on your computer only, not on engenty.ai |
| Apple Intelligence "switched off" or "Apple is still loading the model" | Switch it on under System Settings → Apple Intelligence & Siri, or wait until the Mac has the model. The studio asks again after a minute |
| A step on Apple Intelligence fails: the text is too long | The model takes 4,096 tokens for prompt and answer. Give the step the class High, or bind its class elsewhere under Settings → Models. See [Apple Intelligence](./models.md#apple-intelligence) |
| A voice note the Mac writes down fails in Chrome or Firefox | Their recordings need ffmpeg on the Mac: install it, or set `FFMPEG_PATH` |

## Running wizards

| What you see | Do |
|---|---|
| PDF or PNG export, or a step on a website, fails | `wizards doctor` names the browser the app uses. Install Chrome, Edge or Chromium (on a Mac also Brave), or set `CHROME_PATH` to one; see [Settings](./command-line.md#settings) |
| A widget offers no video | Install ffmpeg, or set `FFMPEG_PATH` |
| "This wizard is not available right now" | The link is switched off, or the account the wizard runs on has no credits left. See [Test and share](./test-and-share.md) |
| The wizard says its limit is reached for today | The link's runs for the day are used up; the day starts at midnight UTC. Raise "Runs per day" in the share dialog |
| "This wizard does not exist (anymore)" | It is not published, or its link was replaced by a new one |
| Others cannot open the link | An install on your computer answers on `localhost` only. See [who can open the link](./test-and-share.md#who-can-open-the-link) |
| The chat has no phone button, or "Join" stays grey | A live conversation needs "Live voice" or "Video call" switched on for the wizard (see [Channels](./test-and-share.md#channels); your own test run always has it) and an OpenAI API key under Settings → Models |
| The camera, microphone or location does not work | Allow it in the browser's site settings (the lock icon in the address bar) |
| A connector says "not set up" | The install needs an OAuth client for it. See [Connectors](./connectors.md) |
| A step stops at a plugin's tool | That plugin is not installed here. See [Plugins](./plugins.md) |

## Updating

| What you see | Do |
|---|---|
| "The update failed" | The reason is in `~/.engenty/wizards/logs/update.log`. Run `wizards update` in a terminal to see it live |
| A template "Needs a newer app" | Update: `wizards update` |

## Still stuck

`wizards logs` shows the last lines the install printed; keys and tokens are taken out. Open an
issue at [github.com/engenty/engenty-wizards](https://github.com/engenty/engenty-wizards/issues)
with what `wizards doctor` prints and the lines that matter.

With a [linked account](./models.md#account), `wizards report` sends the status, the model settings
(never a key) and the last 500 log lines to engenty, and names the report's id: give that id when
you ask for help. Nothing is sent unless you run the command. Without a linked account it says
so: link one under Settings → Account.
