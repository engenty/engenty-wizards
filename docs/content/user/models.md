---
title: Models and account
description: Who does what your wizards ask for — an installed AI client, your own API keys, a local model, or credits.
version: 0.2.48
---

Settings → Models decides who does what your wizards ask for. On your computer it is yours; on
engenty.ai it is the team's, and only its admins change it.

## What the wizards can do

The menu on the left lists five capabilities, each with a dot for how it runs: green on something
of your own, amber on credits, hollow when nothing is set up.

| Capability | Used for | Classes |
|---|---|---|
| Text & reasoning | Writing, research, decisions; the assistant and the editor's chat | Classifier, Standard, High, Highest |
| Images | Logos, product shots, illustrations | Image |
| Videos | Short clips from text or a picture | Video |
| Voice | Reading text aloud | Speech |
| Voice notes | Writing down what is said | Audio |

A capability's page asks "Who does it?":

| Choice | What it is | Cost |
|---|---|---|
| Your subscription | Claude Code, Codex, Gemini CLI or Cursor Agent on this computer, on your sign-in there (text; Codex also images) | Your subscription |
| Own API key | OpenAI, Anthropic, Google Gemini, fal.ai, ElevenLabs, Replicate or Vercel AI Gateway | The provider bills your key |
| Local model | [Ollama](https://ollama.com) on this computer (text) | Nothing |
| engenty credits | Your account's credits; engenty picks the model, or you pick one it offers (FLUX on fal, ElevenLabs voices, Veo …) | Credits |

Then the model of the provider you picked, and "Try it": a short answer, a test image, a voice to
hear, a 4-second clip or a transcript. A try costs like a real call.

With an account, credits step in where nothing of your own is set up — videos without a key of
your own, say. The switch under "engenty credits" turns that off; then a capability without a way
of its own does not run.

## Keys

A key is checked with its provider before it is kept. On your computer keys stay in the Keychain
on a Mac, elsewhere in an encrypted file in the data folder; on engenty.ai they are kept encrypted
for the team. They are never in the database and never shown again.

Under "Access" stand the credits, the AI clients on this computer and each provider you gave a
key; the other providers are under "More providers". A provider's page holds its key, what it is
used for, and which of its models run on credits without a key of your own.

On engenty.ai, keys of your own come with the Pro plan; without them the team's credits pay.

A Vercel AI Gateway key on Vercel's free tier is refused for many models. The Models page and the
check before a run say so, with the link to top up at Vercel.

| Provider | Serves |
|---|---|
| OpenAI | Text, images, voice, transcripts |
| Anthropic | Text |
| Google Gemini | Text, images, video (Veo), voice, voice notes |
| fal.ai | Images (FLUX, Recraft, Imagen), video (Veo, Luma, MiniMax), voice, transcripts |
| ElevenLabs | Voices, transcripts (Scribe) |
| Replicate | Images, video |
| Vercel AI Gateway | Many providers' models with one key, web search |

## Model per class

A step names a class, never a model. For text, "Adjust per class" picks the model of each class:

| Class | Used for |
|---|---|
| Classifier | Decisions, picking values out of text |
| Standard | Short copy, API calls |
| High | Research, long documents; the [assistant](./assistant.md) |
| Highest | Hard reasoning, code; the editor's chat |

A model is written `vendor/model` for the AI Gateway, with the provider in front
(`openai:gpt-5.4-mini`, `fal:fal-ai/flux/schnell`, `ollama:qwen3`), or `credits` /
`credits:<model>` for the credits.

Decisions in a wizard (a branch with a statement, a field shown when the AI finds a statement
true) and the check of what a Knowledge search found go to a decision model, Jev, where there is
a way to one: an AI Gateway key, a TypeSafe key (`TYPESAFE_API_KEY` in the settings file) or an
account. Otherwise the Classifier class decides.

## The editor's chat

Where Claude Code is installed on this computer, "The studio chat answers on" (on the page of
Text & reasoning) picks what builds your wizards in the editor's conversation:

| Choice | Means |
|---|---|
| Model class Highest | The model bound to that class |
| Claude subscription (Claude Code) | The Claude Code installed on this computer builds the wizard, on your sign-in there. Runs keep using keys or credits |

## Account

An account is optional. With it you

- use credits instead of your own keys (the editor's note about missing models says so where
  text, image or video models are missing),
- publish wizards to the cloud, where their links run while your computer is off
  ([Test and share](./test-and-share.md#in-the-cloud)),
- connect Gmail, Drive, Calendar and Contacts without a Google client of your own
  ([Connectors](./connectors.md)).

Settings → Account signs you in, in your browser. A new account needs an invitation code: type it
there and "Create account" opens the sign-up page with it. An account starts with credits;
some of them may end on a date, which the settings show. Runs in the cloud are paid from the
account's credits and stop when they are used up, until you top up.

While an account is signed in, the studio calls you by its name and e-mail: Settings → Account
shows them under "Profile" without changing them. The avatar carries a small cloud; its menu
says "Connected to engenty.ai" and the credits, or that the sign-in has run out.

Without an account the app is not connected to anything: wizards, the space and its files stay on
your computer.
