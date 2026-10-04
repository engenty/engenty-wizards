# Plan: setup by capability

Status: concept. Written on 2026-10-04 after checking a fresh local install (0.1.4, Codex
signed in with ChatGPT, no keys); parts marked *built* landed the same day.

Scope: the local install's `/setup` page, the model settings (`/settings/models`) and what a
wizard checks before it runs. The managed runtime is not part of this plan.

## What the check found

| Finding | Effect |
|---|---|
| Setup gates on one test call to a text class only | The studio opens while images, video and voice cannot run; a run fails at the first such step |
| Image, video, audio, speech showed Google models with no key to reach them | The settings looked complete when nothing there could run (*built*: empty without a gateway key) |
| Codex ran every class on `default` | No small model for decisions, no strong one for `highest` (*built*: Luna / Sol / Astra) |
| Codex makes images on a ChatGPT plan, the runtime did not use it | Images needed a paid key although the subscription covers them (*built*: `codex/image`) |
| No client makes video or speech; Claude makes no images | Video and voice always need a key: setup never says so |
| A test run that cannot start shows nothing in the editor | The Test button just stops (*built*: the editor names the missing models; a start on every path is refused) |
| The settings form keeps what it loaded and saves every field | An open tab can overwrite newer settings; saving once stored the default models as bindings |
| One source for everything | Text from Claude and images from Codex is not possible, though both are signed in |
| Bindings of another client stay stored and are ignored silently | After switching Codex → Claude the settings still show Codex models that do nothing |

## The capabilities

A step names a class; the person thinks in what the install can do. Setup and settings show
capabilities, each with where it runs and what it would take:

| Capability | Classes | Without a key | With a key |
|---|---|---|---|
| Text, reading photos | classifier, standard, high, highest | Codex, Claude, Gemini, Cursor | AI Gateway, OpenAI, Anthropic, Ollama |
| Images | image | Codex (ChatGPT plan) | AI Gateway, OpenAI |
| Video | video | none | AI Gateway |
| Voice | speech | none (later: macOS `say`, see below) | AI Gateway, OpenAI |
| Transcribing recordings | audio | none | AI Gateway, OpenAI |

## Setup

1. **Text first, as today.** Choose a client, install, sign in, one test call. The studio does
   not open before it works (as agreed: setup gates until it works).
2. **Then a capability list, not a gate.** One row per capability above: ✓ with the source, or
   what it needs ("Video: AI-Gateway-Schlüssel"). Rows that can be fixed on the spot: install /
   sign in a second client, paste a key, install ffmpeg. "Zum Studio" is always there; nothing
   but text is required.
3. **A second client for images.** Claude chosen for text and Codex installed: setup offers
   "Bilder über Codex". Needs the source per capability (below).
4. **The command line says the same.** `engenty-wizards setup` and `doctor` print the
   capability list instead of only the clients.

## Settings

- **Source per capability.** `models.source` becomes the text source; `image` gets its own
  source (a client with images, a key, or none). Video, voice and transcription stay with keys.
  Stored as today: `{ source, bindings, imageSource? }` in the `models` setting.
- **Choices, not free text.** A class row is a select of what the source offers: Claude's
  aliases, Codex's models from `~/.codex/models_cache.json` (the client's own list), the
  gateway's catalog. Free text stays as "Anderes Modell …".
- **Save what changed.** The form sends only the fields the person touched, and reloads after
  another tab or the setup saved (the `models` query refetches on focus).
- **Bindings of another client** are dropped when the source changes, or shown struck out with
  "gilt nur für Codex".

## Before a run (*built*)

`apps/runtime/src/engine/requirements.ts`: each step's classes, the steps every run passes
through, `classProblem()` per class without calling it.

| Where | What happens |
|---|---|
| Editor | A notice above the flow lists missing models with their steps; Test is disabled when a step on every path cannot run |
| `createRun` | Refuses a start that cannot finish; test runs answer 400 with the steps, live runs "nicht verfügbar" |

Next:
- **Publish** warns the same way: a published wizard whose every run fails is worse than a test.
- **The architect** gets the capability list in its context, so a new wizard on a Codex-only
  install defaults to what runs ("Animierte Fotos", voice off) and says what a key would add.
- **Marketplace starters** show which capabilities they need before they are added.

## Later

- **Voice without a key:** macOS `say` with a German voice as a `local/say` speech source:
  free, offline, clearly worse than Gemini TTS. Only as a choice the person makes.
- **Images through Codex are slow** (about 50 s each); a wizard with ten rooms takes eight
  minutes for the photos. The estimate should show time for client images, not only credits.

## Open questions

- Should a gateway key, once present, take images from Codex back to the gateway (faster,
  paid), or does the subscription stay first until the person chooses?
- Does Codex's image tool keep a plan limit per day? Unknown; the failure text decides whether
  `failureOf` maps it to "Kontingent aufgebraucht".
