---
title: First start
description: Choose what engenty wizards thinks with. The studio opens once a test call works.
---

The first page of the studio is the setup. It asks one thing: what should engenty think with?

![The setup: choose the engine, an installed AI client or your own keys](../../assets/setup.png)

## Choose your engine

| Engine | Runs on | Needs |
|---|---|---|
| Claude Code | Your Claude subscription | The client installed and signed in |
| Codex | Your ChatGPT subscription | The client installed and signed in |
| Gemini CLI | Your Google account | The client installed and signed in |
| Cursor Agent | Your Cursor subscription | The client installed and signed in |
| Own keys | Vercel AI Gateway, OpenAI or Anthropic | One API key |
| Ollama | A model on your computer | [Ollama](https://ollama.com) running |

- **An AI client that is not installed** installs right on the page, in a terminal shown there.
  It takes about a minute.
- **Signing in** happens in the same terminal, with the client's own sign-in: your browser opens
  for it, and the terminal closes once the sign-in is there.
- **A client signed in with an API key from your shell** is not on your subscription. Sign in on
  the page so it is.

## The test

After you connect, one short call shows whether the way to the model is open. The setup stays
until that call works; then "Open the studio" takes you in.

## What an AI client does not cover

An installed AI client writes and reasons. Codex also makes images on your sign-in; with the
other clients images need a key. Video and audio need a key with every client. One Vercel AI
Gateway key serves text, images, video and web search. You can add it later under
[Models & account](./models.md).

## Change it later

Settings → Models & account. See [Models and account](./models.md).
