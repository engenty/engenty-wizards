---
title: Models and account
description: What the wizards think with — an installed AI client, your own keys, a local model, or an account's credits.
---

Settings → Models & account decides where the models run. The section exists in an install on
your own computer; on engenty.ai the service sets the models.

## Where models run

| Source | What it is | Cost |
|---|---|---|
| An installed AI client | Claude Code, Codex, Gemini CLI or Cursor Agent on this computer, on your sign-in there | Your subscription |
| Own keys | Vercel AI Gateway, OpenAI or Anthropic | The provider bills your key |
| A local model | [Ollama](https://ollama.com) on this computer | Nothing |
| The account's credits | Every model call goes through your engenty account | Credits |

- An AI client that is missing installs from this page; one that is not signed in signs in here.
  "Check again" looks anew after you changed something in your own terminal.
- With an AI client, text needs no key. Video and audio always need a key; images too, except
  with Codex.
- "Test" makes one short call and shows the answer, the model and how long it took.

## Keys

One key is enough. Keys you enter are kept in the Keychain on a Mac, elsewhere in an encrypted
file in the data folder. They are never in the database.

| Key | Serves |
|---|---|
| Vercel AI Gateway | Text, images, video and web search |
| OpenAI | OpenAI models |
| Anthropic | Anthropic models |

## Model per class

A step names a class, never a model. Here you say which model serves each class:

| Class | Used for | Example |
|---|---|---|
| Classifier | Decisions, picking values out of text | `anthropic/claude-haiku-4.5` |
| Standard | Short copy, API calls | `openai:gpt-5.4-mini` |
| High | Research, long documents | `anthropic/claude-sonnet-5.5` |
| Highest | Hard reasoning, code; the studio's assistant | `anthropic/claude-sonnet-5.5` |
| Image, Video | Generated media | `google/gemini-3.1-flash-image` |
| Audio | Writing down voice notes | a model that takes audio files |
| Speech | Reading a voice-over aloud | a text-to-speech model |

A model is written `vendor/model` for the AI Gateway, or with the provider in front:
`openai:gpt-5.4-mini`, `ollama:qwen3`.

## The studio's assistant

"The studio chat answers on" picks what builds your wizards in the conversation:

| Choice | Means |
|---|---|
| Model class Highest | The model bound to that class |
| Claude subscription (Claude Code) | The Claude Code installed on this computer builds the wizard, on your sign-in there. Runs keep using keys or credits |

## Account

An account is optional. With it you

- use credits instead of your own keys (the editor's note about missing models says so where
  text, image or video models are missing),
- publish wizards to the cloud, where their links run while your computer is off
  ([Test and share](./test-and-share.md#in-the-cloud)).

Settings → Account signs you in, in your browser. A new account needs an invitation code: type it
there and "Create an account" opens the sign-up page with it. An account starts with credits;
some of them may end on a date, which the settings show. Runs in the cloud are paid from the
account's credits and stop when they are used up, until you top up.

While an account is signed in, the studio calls you by its name and e-mail: Settings → Account
shows them under "Profile" without changing them. The avatar carries a small cloud; its menu
says "Connected to engenty.ai" and the credits, or that the sign-in has run out.

Without an account the app is not connected to anything: wizards, the space and its files stay on
your computer.
