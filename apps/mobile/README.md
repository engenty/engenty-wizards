# engenty wizards — the mobile app

Expo (SDK 57) app for iOS and Android: adds published wizards (QR code, ID, link), runs them in
the runtime's own runner (a WebView on `/w/<token>?app=1` with `window.engentyApp`), keeps
results on the phone and shares them. Plan: [docs/plans/mobile-app.md](../../docs/plans/mobile-app.md).

```bash
pnpm --filter @engenty-wizards/mobile start      # Metro, for a development build
pnpm --filter @engenty-wizards/mobile ios        # build and run on the iOS simulator
pnpm --filter @engenty-wizards/mobile android    # build and run on an Android emulator
pnpm --filter @engenty-wizards/mobile typecheck
pnpm --filter @engenty-wizards/mobile test
```

`ios/` and `android/` are generated (`npx expo prebuild`) and not committed; native settings
live in `app.json`. `modules/apple-intelligence` is an Expo module in Swift: Apple's models on
the phone (iOS 26, Foundation Models and SpeechAnalyzer) behind the bridge abilities
`transcribe` and `think`, built from the same `Shared.swift` as the runtime's Mac helper
(`apps/runtime/apple`). The bridge names them to a page only where the phone has them. The workspace's `pnpm build` leaves the app out: a store build is its own
release (`mobile-vX.Y.Z`).

Generated files — run again when their source changes:

| File | From | Command |
|---|---|---|
| `src/engenty/shapes.ts`, `apps/runtime/src/services/engenty-shapes.ts` | `apps/web/src/engenty/engenty.tsx` | `pnpm --filter @engenty-wizards/web exec tsx ../mobile/scripts/engenty-shapes.tsx` |
| `assets/*.png` | the drop in `shapes.ts` | `node scripts/icons.mjs` |

Links into the app: `engenty.ai/w/*` and `/s/*` (Universal Links, App Links; the runtime serves
the two `/.well-known` files when `MOBILE_IOS_APP_IDS` and `MOBILE_ANDROID_CERT_SHA256` are set)
and `engenty-wizards://w?url=…` for runtimes on other hosts.
