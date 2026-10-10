---
title: Models and account
description: Who does what your wizards ask for — an installed AI client, your own API keys, a local model, or credits.
---

Settings → Models decides who does what your wizards ask for. On your computer it is yours; on
engenty.ai it is the team's, and only its admins change it.

## What the wizards can do

The menu on the left lists five capabilities, each with a dot for how it runs: green on something
of your own, amber on credits, hollow when nothing is set up.

| Capability | Used for | Classes |
|---|---|---|
| Text & reasoning | Writing, research, decisions; the studio's assistant | Classifier, Standard, High, Highest |
| Images | Logos, product shots, illustrations | Image |
| Videos | Short clips from text or a picture | Video |
| Voice | Reading text aloud | Speech |
| Voice notes | Writing down what is said | Audio |

A capability's page asks "Who does it?":

| Choice | What it is | Cost |
|---|---|---|
| Your subscription | Claude Code, Codex, Gemini CLI or Cursor Agent on this computer, on your sign-in there (text; Codex also images) | Your subscription |
| Own API key | OpenAI, Anthropic, Google Gemini, fal.ai, ElevenLabs, Replicate or Vercel AI Gateway | The provider bills your key |
| Apple Intelligence | The model of Apple Intelligence on this Mac (text: Classifier and Standard) — shown on a Mac with Apple silicon on macOS 26 or later | Nothing |
| Local model | [Ollama](https://ollama.com) on this computer (text) | Nothing |
| engenty credits | Your account's credits; engenty picks the model, or you pick one it offers (FLUX on fal, ElevenLabs voices, Veo …) | Credits |

Then the model of the provider you picked, and "Try it": a short answer, a test image, a voice to
hear, a 4-second clip or a transcript. A try costs like a real call.

With an account, credits step in where nothing of your own is set up — videos without a key of
your own, say. The switch under "engenty credits" turns that off; then a capability without a way
of its own does not run.

## Apple Intelligence

On a Mac with Apple silicon and macOS 26 or later, "Text & reasoning" offers Apple Intelligence:
the model Apple keeps on the Mac. Nothing leaves the machine, nothing is signed in and nothing
is paid. It needs Apple Intelligence switched on (System Settings → Apple Intelligence & Siri);
until then the choice says why it waits.

The model is small and reads at most 4,096 tokens for a prompt and its answer together. So it
takes the classes Classifier and Standard — decisions, picking values out of text, short copy —
while High and Highest keep the way they had (a key, an installed client or the credits). A
step whose text is too long for it fails with a note that says so; bind that class elsewhere.
The binding is `apple:default`; `apple:tagging` is Apple's adapter for tagging and extraction.

"Voice notes" offers Apple Intelligence on the same Macs: the Mac writes a recording down
itself (`apple:transcribe`), in the Mac's language, for nothing. The first note in a language
waits while Apple fetches it.

**In the app.** On an iPhone with iOS 26 the engenty wizards app writes voice notes down on the
phone, and once Apple Intelligence is switched on it also answers a run's short text calls —
Classifier and Standard steps without tools or files of their own — so a run in the cloud
spends no credits on them and that text never leaves the phone. Where the phone does not
answer, the run thinks the way these settings say.

## Keys

A key is checked with its provider before it is kept. On your computer keys stay in the Keychain
on a Mac, elsewhere in an encrypted file in the data folder; on engenty.ai they are kept encrypted
for the team. They are never in the database and never shown again.

Each provider has a page under "Access": its key, what it is used for, and which of its models run
on credits without a key of your own.

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
| High | Research, long documents |
| Highest | Hard reasoning, code; the studio's assistant |

A model is written `vendor/model` for the AI Gateway, with the provider in front
(`openai:gpt-5.4-mini`, `fal:fal-ai/flux/schnell`, `ollama:qwen3`), or `credits` /
`credits:<model>` for the credits.

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
