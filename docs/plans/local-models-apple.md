# Plan: Apple's local models

Status: the Mac side built on 2026-10-10 (this branch); the phone side is not. Written on
2026-10-10, after an investigation of MLX and the Foundation Models framework.

Scope: the models Apple keeps on a device — the Foundation Models framework behind Apple
Intelligence (macOS 26, iOS 26) — as a way for wizards to think, only on devices that have them.
Open-weight models through MLX on a phone are out: 1–5 GB downloads, 8 GB phones only, no
simulator, small single-maintainer wrappers. On a Mac, MLX is already there through Ollama 0.19+.

## What a wizard can get from Apple

| Framework | Capability | Fits |
|---|---|---|
| Foundation Models, `SystemLanguageModel.default` | Text | Classifier, Standard. 4,096 tokens for prompt and answer together; guided generation keeps to a schema; no tools over the runtime's bridge |
| Foundation Models, `useCase: .contentTagging` | Text | Classifier: tagging, extraction |
| SpeechAnalyzer (macOS 26, iOS 26) | Voice notes | transcription on the device — not built |
| NLContextualEmbedding | Wissen search | 512-dim vectors — not built |

Devices: Apple Intelligence — a Mac with Apple silicon, iPhone 15 Pro, iPhone 16 and later,
iPhone Air, iPad with M1 or A17 Pro; Apple Intelligence switched on; 16 languages incl. German.

## The Mac (built)

The runtime runs on the Mac, so Apple's model is one more way beside an installed client, a
key and Ollama:

| | Where |
|---|---|
| `wizards-apple`: a Swift helper, one process per call — `status`, `generate` with a JSON schema turned into a `DynamicGenerationSchema` | `apps/runtime/apple/main.swift`, built by `apps/runtime/scripts/build-apple.mjs` into `dist/apple/` |
| The model: `apple:default`, `apple:tagging`; the harness base runs it like a client, tools become warnings | `apps/runtime/src/harness/apple.ts` |
| Where a class runs: `apple` is a local provider; the availability and its reason in `GET /api/studio/models` (`apple`) | `apps/runtime/src/models.ts` |
| The choice "Apple Intelligence" under Text & reasoning, shown only where the machine supports it, enabled once it answers; binds Classifier and Standard | `apps/web/src/studio/Models.tsx` |
| The release: a `macos-26` job builds the helper, the package made on Linux takes it in | `.github/workflows/release.yml`, `scripts/npm-package.mjs --apple` |

Measured on an M-series Mac on macOS 26.5: 1.3 s for the first answer of a process, 0.4–0.7 s
after that, a guided JSON answer in about 1 s; six calls in a row without a rate limit. Apple
rate-limits command-line tools under load; `rateLimited` comes back as "try again shortly".

Not built on the Mac: transcription (SpeechAnalyzer) for voice notes, embeddings, image input
(macOS 27), the Private Cloud Compute model.

## The phone (not built)

The app runs wizards in the runtime's runner (a WebView); the steps think on the runtime. The
phone's model can only answer calls the runtime hands it, through the bridge
(`apps/mobile/src/bridge`), for a run started in the app while the app is in the foreground.
Worth it for cloud runs — no credits, the text stays on the phone; pointless beside a Mac.

1. **Transcription first.** A bridge ability `transcribe` (SpeechAnalyzer through
   `@react-native-ai/apple`): the voice-note field hands the runner text instead of uploading
   the recording. No context limit, a clear win. Android: Gemini Nano where ML Kit has it.
2. **Text second.** A bridge ability `think` with a JSON schema; the runtime uses it for
   Classifier and Standard calls of that run when the prompt fits 4k tokens, else its own way.
   The runner announces the ability only where `SystemLanguageModel.default` is available.

Both need a development build (Expo module with native code), the runner in `apps/web` asking
`window.engentyApp` before its web way, and a run API that lets the runtime ask the app.
