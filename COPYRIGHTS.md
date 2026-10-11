# Copyrights

Copyright © 2026 Matthias Platzer.

The code in this repository is published under the Functional Source License, version 1.1,
with the MIT future licence ([LICENSE](LICENSE), `FSL-1.1-MIT`): use it for yourself and your
company, run it, change it — just don't offer it to others as a competing product or service.
Each release becomes MIT two years after it is published. Every package of the workspace names
that licence in its `package.json`.

"engenty", "engenty wizards", the wordmark and the engenty figures are marks of their owner. The
licence covers the code, the figures as code included; it does not license the marks for another
product or service.

## What is not ours

| Files | Source | Terms |
|---|---|---|
| `apps/web/public/ai-labels/*.svg` | the European Commission's icons for marking AI-generated and AI-modified content (AI Act, Art. 50), as published by the Commission | © European Union; reused unchanged under the Commission's reuse policy (Decision 2011/833/EU) |

## Third-party software

What the runtime, the studio and the runner are built with and run on, under its own licence,
as the studio's About page shows it (`apps/web/src/about/oss-credits.json`). The full licence
text of each package is in the package itself (`node_modules/<name>/LICENSE`). Written by
`pnpm about:data --credits`; run it after a dependency changes.

<!-- third-party: written by scripts/write-about-data.mjs, do not edit by hand -->

### Shared

Declared by two or more of the workspaces below:

| Package | Version | Licence |
|---|---|---|
| [@modelcontextprotocol/client](https://modelcontextprotocol.io) | 2.2.0 | MIT |
| [@modelcontextprotocol/ext-apps](https://github.com/modelcontextprotocol/ext-apps) | 2.0.3 | MIT |
| [lucide-react](https://lucide.dev) | 1.49.0 | ISC |
| [marked](https://marked.js.org) | 18.0.14 | MIT |
| [react](https://react.dev/) | 19.3.0 | MIT |
| [react-dom](https://react.dev/) | 19.3.0 | MIT |
| [zod](https://zod.dev) | 4.6.5 | MIT |

### docs (apps/docs)

| Package | Version | Licence |
|---|---|---|
| [fumadocs-core](https://fumadocs.dev) | 16.15.11 | MIT |
| [fumadocs-mdx](https://fumadocs.dev) | 15.4.1 | MIT |
| [fumadocs-ui](https://fumadocs.dev) | 16.15.11 | MIT |
| [mermaid](https://github.com/mermaid-js/mermaid#readme) | 11.17.2 | MIT |
| [next](https://nextjs.org) | 16.3.5 | MIT |
| [next-themes](https://github.com/pacocoursey/next-themes#readme) | 0.4.6 | MIT |

### mobile (apps/mobile)

| Package | Version | Licence |
|---|---|---|
| [@expo-google-fonts/space-grotesk](https://github.com/expo/google-fonts/tree/master/font-packages/space-grotesk#readme) | 0.4.1 | MIT AND OFL-1.1 |
| [expo](https://github.com/expo/expo/tree/main/packages/expo) | 57.0.26 | MIT |
| [expo-blur](https://docs.expo.dev/versions/latest/sdk/blur-view/) | 57.0.3 | MIT |
| [expo-camera](https://docs.expo.dev/versions/latest/sdk/camera/) | 57.0.6 | MIT |
| [expo-clipboard](https://docs.expo.dev/versions/latest/sdk/clipboard) | 57.0.2 | MIT |
| [expo-constants](https://docs.expo.dev/versions/latest/sdk/constants/) | 57.0.20 | MIT |
| [expo-crypto](https://docs.expo.dev/versions/latest/sdk/crypto/) | 57.0.3 | MIT |
| [expo-file-system](https://docs.expo.dev/versions/latest/sdk/filesystem/) | 57.0.7 | MIT |
| [expo-font](https://docs.expo.dev/versions/latest/sdk/font/) | 57.0.4 | MIT |
| [expo-glass-effect](https://docs.expo.dev/versions/latest/sdk/glass-effect/) | 57.0.4 | MIT |
| [expo-haptics](https://docs.expo.dev/versions/latest/sdk/haptics/) | 57.0.3 | MIT |
| [expo-intent-launcher](https://docs.expo.dev/versions/latest/sdk/intent-launcher/) | 57.0.1 | MIT |
| [expo-keep-awake](https://docs.expo.dev/versions/latest/sdk/keep-awake/) | 57.0.2 | MIT |
| [expo-linking](https://docs.expo.dev/versions/latest/sdk/linking) | 57.0.11 | MIT |
| [expo-localization](https://docs.expo.dev/versions/latest/sdk/localization/) | 57.0.2 | MIT |
| [expo-notifications](https://docs.expo.dev/versions/latest/sdk/notifications/) | 57.0.21 | MIT |
| [expo-router](https://docs.expo.dev/routing/introduction/) | 57.0.24 | MIT |
| [expo-secure-store](https://docs.expo.dev/versions/latest/sdk/securestore/) | 57.0.4 | MIT |
| [expo-sharing](https://docs.expo.dev/versions/latest/sdk/sharing/) | 57.0.22 | MIT |
| [expo-splash-screen](https://docs.expo.dev/versions/latest/sdk/splash-screen/) | 57.0.9 | MIT |
| [expo-sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/) | 57.0.3 | MIT |
| [expo-status-bar](https://docs.expo.dev/versions/latest/sdk/status-bar/) | 57.0.1 | MIT |
| [expo-system-ui](https://docs.expo.dev/versions/latest/sdk/system-ui) | 57.0.4 | MIT |
| [expo-web-browser](https://docs.expo.dev/versions/latest/sdk/webbrowser/) | 57.0.3 | MIT |
| [react-native](https://reactnative.dev/) | 0.86.3 | MIT |
| [react-native-gesture-handler](https://docs.swmansion.com/react-native-gesture-handler/) | 3.3.0 | MIT |
| [react-native-reanimated](https://docs.swmansion.com/react-native-reanimated) | 4.7.1 | MIT |
| [react-native-safe-area-context](https://github.com/AppAndFlow/react-native-safe-area-context#readme) | 5.7.0 | MIT |
| [react-native-screens](https://github.com/software-mansion/react-native-screens#readme) | 4.26.2 | MIT |
| [react-native-svg](https://github.com/react-native-community/react-native-svg) | 15.15.4 | MIT |
| [react-native-webview](https://github.com/react-native-webview/react-native-webview#readme) | 13.16.1 | MIT |
| [react-native-worklets](https://docs.swmansion.com/react-native-worklets) | 0.10.1 | MIT |

### runtime (apps/runtime)

| Package | Version | Licence |
|---|---|---|
| [@ai-sdk/anthropic](https://ai-sdk.dev/docs) | 4.0.54 | Apache-2.0 |
| [@ai-sdk/elevenlabs](https://ai-sdk.dev/docs) | 3.0.42 | Apache-2.0 |
| [@ai-sdk/fal](https://ai-sdk.dev/docs) | 3.0.42 | Apache-2.0 |
| [@ai-sdk/gateway](https://ai-sdk.dev/docs) | 4.0.82 | Apache-2.0 |
| [@ai-sdk/google](https://ai-sdk.dev/docs) | 4.0.72 | Apache-2.0 |
| [@ai-sdk/openai](https://ai-sdk.dev/docs) | 4.0.67 | Apache-2.0 |
| [@ai-sdk/replicate](https://ai-sdk.dev/docs) | 3.0.42 | Apache-2.0 |
| [@clack/prompts](https://github.com/bombshell-dev/clack/tree/main/packages/prompts#readme) | 1.8.1 | MIT |
| [@executor-js/plugin-openapi](https://github.com/UsefulSoftwareCo/executor/tree/main/packages/plugins/openapi) | 1.6.8 | MIT |
| [@hono/node-server](https://github.com/honojs/node-server) | 2.1.3 | MIT |
| [@libsql/client](https://github.com/tursodatabase/libsql-client-ts#readme) | 0.18.0 | MIT |
| [@mastra/core](https://mastra.ai) | 1.74.0 | Apache-2.0 |
| [@mastra/docker](https://mastra.ai) | 0.8.0 | Apache-2.0 |
| [@mastra/mcp](https://mastra.ai) | 2.1.2 | Apache-2.0 |
| [@modelcontextprotocol/server](https://modelcontextprotocol.io) | 2.2.0 | MIT |
| [@napi-rs/canvas](https://github.com/Brooooooklyn/canvas#readme) | 0.1.80 | MIT |
| [@turbodocx/html-to-docx](https://github.com/TurboDocx/html-to-docx#readme) | 1.23.1 | MIT |
| [ai](https://ai-sdk.dev/docs) | 7.0.102 | Apache-2.0 |
| [aws4fetch](https://github.com/mhart/aws4fetch#readme) | 1.0.20 | MIT |
| [drizzle-orm](https://orm.drizzle.team) | 0.45.3 | Apache-2.0 |
| [effect](https://effect.website) | 4.0.0-beta.59 | MIT |
| [exceljs](https://github.com/exceljs/exceljs#readme) | 4.4.0 | MIT |
| [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser#readme) | 5.11.2 | MIT |
| [fflate](https://101arrowz.github.io/fflate) | 0.8.3 | MIT |
| [hono](https://hono.dev) | 4.13.12 | MIT |
| [imapflow](https://imapflow.com/) | 2.2.1 | MIT |
| [jiti](https://github.com/unjs/jiti#readme) | 2.7.0 | MIT |
| [jose](https://github.com/panva/jose) | 6.2.12 | MIT |
| [mammoth](https://github.com/mwilliamson/mammoth.js#readme) | 1.13.0 | BSD-2-Clause |
| [nanoid](https://github.com/ai/nanoid#readme) | 5.1.16 | MIT |
| [node-pty](https://github.com/microsoft/node-pty) | 1.1.0 | MIT |
| [pdf-parse](https://mehmet-kozan.github.io/pdf-parse/) | 2.4.5 | Apache-2.0 |
| [playwright-core](https://playwright.dev) | 1.63.0 | Apache-2.0 |
| [postal-mime](https://postal-mime.postalsys.com) | 4.0.2 | MIT-0 |
| [rfc6902](https://github.com/chbrown/rfc6902) | 5.3.0 | MIT |
| [turndown](https://github.com/mixmark-io/turndown#readme) | 7.2.4 | MIT |

### web (apps/web)

| Package | Version | Licence |
|---|---|---|
| [@dagrejs/dagre](https://github.com/dagrejs/dagre#readme) | 3.1.1 | MIT |
| [@tanstack/react-query](https://tanstack.com/query) | 5.104.0 | MIT |
| [@xterm/addon-fit](https://github.com/xtermjs/xterm.js/tree/master#readme) | 0.11.0 | MIT |
| [@xterm/addon-web-links](https://github.com/xtermjs/xterm.js/tree/master#readme) | 0.12.0 | MIT |
| [@xterm/xterm](https://github.com/xtermjs/xterm.js#readme) | 6.0.0 | MIT |
| [@xyflow/react](https://reactflow.dev) | 12.12.0 | MIT |
| [dompurify](https://github.com/cure53/DOMPurify) | 3.4.16 | (MPL-2.0 OR Apache-2.0) |
| [qr-scanner](https://github.com/nimiq/qr-scanner#readme) | 1.4.2 | MIT |
| [react-router](https://github.com/remix-run/react-router#readme) | 7.18.4 | MIT |
| [uqr](https://github.com/unjs/uqr#readme) | 0.1.3 | MIT |

### Development only

Used to build, check and test; not part of what people run:

| Package | Version | Licence |
|---|---|---|
| [@biomejs/biome](https://biomejs.dev) | 2.5.0 | MIT OR Apache-2.0 |
| [@rivet-dev/agentos-core](https://github.com/rivet-dev/agentos#readme) | 0.2.22 | Apache-2.0 |
| [@rivet-dev/agentos-runtime-core](https://github.com/rivet-dev/agentos#readme) | 0.2.22 | Apache-2.0 |
| [@tailwindcss/postcss](https://tailwindcss.com) | 4.3.3 | MIT |
| [@tailwindcss/vite](https://tailwindcss.com) | 4.3.3 | MIT |
| [@types/mdx](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/mdx) | 2.0.14 | MIT |
| [@types/node](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node) | 26.6.4 | MIT |
| [@types/react](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react) | 19.3.0 | MIT |
| [@types/react-dom](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react-dom) | 19.3.0 | MIT |
| [@types/turndown](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/turndown) | 5.0.6 | MIT |
| [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-react#readme) | 6.1.1 | MIT |
| [concurrently](https://github.com/open-cli-tools/concurrently#readme) | 10.0.5 | MIT |
| [drizzle-kit](https://orm.drizzle.team) | 0.31.11 | MIT |
| [git-cliff](https://github.com/orhun/git-cliff#readme) | 2.14.2 | MIT OR Apache-2.0 |
| [postcss](https://postcss.org/) | 8.5.28 | MIT |
| [sharp](https://sharp.pixelplumbing.com) | 0.35.5 | Apache-2.0 |
| [tailwindcss](https://tailwindcss.com) | 4.3.3 | MIT |
| [tsx](https://tsx.hirok.io) | 4.23.15 | MIT |
| [typescript](https://www.typescriptlang.org/) | 6.0.3 | Apache-2.0 |
| [vite](https://vite.dev) | 8.3.2 | MIT |
| [vite-plugin-singlefile](https://github.com/richardtallent/vite-plugin-singlefile/tree/main/#readme) | 2.3.3 | MIT |
| [vitest](https://vitest.dev) | 4.1.11 | MIT |

<!-- /third-party -->
