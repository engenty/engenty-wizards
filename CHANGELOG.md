# Changelog

All notable changes to engenty wizards. Generated from [Conventional Commits](https://www.conventionalcommits.org/)
by [git-cliff](https://git-cliff.org) via `pnpm release`. Pre-`1.0`: a **minor**
bump is a notable or breaking change, **patch** is fixes and small features.

## [0.2.3] - 2026-10-05
- ADDED With an account signed in, what a local install publishes also runs in the cloud: the published version and its files go to the account's cloud runtime under the ids they have here, which shows the project without editing and makes the link; Settings → Konto signs in or creates an account with an invitation code and shows the credits and when they end; the share dialog says what a wizard lacks in the cloud; a team without building rights changes nothing on the server, and what visitors send is capped in size
- ADDED Inside the mobile app the runner reads in the system's font, like the app's own screens; headings keep the brand's
- ADDED The mobile app looks native: the system font, Liquid Glass (a blur before iOS 26) on the floating tab bar and the nav buttons, inset grouped lists with hairlines, Add as a form sheet with eight ID boxes, swipe to share or delete a result, files listed as the Files app does, settings rows with icon tiles
- ADDED The mobile app (apps/mobile, Expo): wizards added by QR code, ID or link, runs in the runtime's runner with the app's scanner, share sheet, downloads, notifications and sign-in sheet, results kept on the phone and shared from there; engenty.ai's /w/ and /s/ links and engenty-wizards:// open in it
- ADDED A run tells the mobile app's device when it is done, failed or waits for the person: the app gives the run its device (POST /api/runs/:id/notify), the runtime asks the Manage-App to push (POST /v1/push in the contract); the app's own requests name the visitor in an x-wizards-visitor header, since iOS merges a Cookie header with its cookie store
- ADDED The runner works inside the mobile app: ?app=1 drops the web's header, footer and install hint, and window.engentyApp takes over the scanner, share sheet, downloads, wake lock, notifications and account sign-in; a wizard gets an 8-character ID (GET /api/public/codes/:code) and the studio's share dialog shows it with a QR code to download as PNG or SVG; the runtime serves apple-app-site-association and assetlinks.json for the app
- DOCS Plan for the mobile app that runs wizards on iOS and Android
- FIXED The mobile app's data folder (apps/mobile/src/data) is in the repository: the ignore rule for the runtime's data folder hid every folder of that name, so main neither typechecked nor passed the mobile app's tests; the rule now names the runtime's two data folders
- FIXED The mobile app runs on Android: no iOS-only WebView prop that crashed the Run screen, plain http only for a runtime on this computer, result rows in the wizard's colour

## [0.2.2] - 2026-10-05
- ADDED **[plugins]** Server.generate asks a model of the current tenant (a class, a prompt, optionally a zod schema for an object), on the models its studio is set up with and paid like any other call; without a model it throws with status 503 and the code no_model, which a route passes on
- DEPLOY The documentation deploys to engenty.ai/docs: an image of its own (apps/docs/Dockerfile, a standalone Next.js server on port 8896), and a release tag moves the branch deploy/docs when the site or its pages changed
- DOCS A documentation site with a user guide and the developer docs for plugins, built like the engenty repo's: Next.js and Fumadocs in apps/docs, the pages in docs/content, in the app's light and dark colours; docs/plugins.md became its pages, and the product's build, image, package and credits leave the site out

## [0.2.1] - 2026-10-05
- ADDED The wizards run in the person's own AI apps — connect writes the MCP server into Claude Desktop, Cursor, Codex and others, a run shows the wizard itself as an MCP App widget, and Settings → Einbinden adds an app with one click and tests it until it works
- FIXED The AI apps start the MCP server as the wizards command, after the rename from engenty-wizards

## [0.2.0] - 2026-10-05
- ADDED A runtime takes plugins: tools for agent steps, routes with tables of their own, listeners on runs that end, and pages, top bar icons and settings sections in the studio; they load from modules/ and PLUGINS_DIR at start and again while it runs

## [0.1.11] - 2026-10-05
- DOCS The package is on npm as wizards, and the README's studio picture shows the branches with their conditions
- FIXED A branch that skips steps runs beside them in the editor, with its condition readable on the line; it ran behind the step with the condition hidden

## [0.1.10] - 2026-10-05
- DOCS The README shows the studio with a branched flow and a wizard in use, from its first page to the result
- FIXED The editor's review notes, tool names and branch labels follow the language; they were German in the English studio

## [0.1.9] - 2026-10-05
- CHANGED The installer is engenty.ai/install.sh (was wizards.sh), and the command and the npm package are wizards (were engenty-wizards); the installer renames an install made under the old names
- DOCS The proxy sends the runtime /w/ and /s/ with the slash

## [0.1.8] - 2026-10-05
- DOCS The marketplace's pages are written by the site at engenty.ai, at /wizards/<slug> and /de/wizards/<slug>

## [0.1.7] - 2026-10-05
- ADDED A banner in the studio says when a newer release is out; the update installs from there, the runtime restarts into the new version and the page reloads
- ADDED The studio chat counts the seconds of a turn and says what the architect is doing and thinking; pasted pictures show in the thread and the architect sees them

## [0.1.6] - 2026-10-05
- ADDED Video models render at 720p, or 480p when a step asks; a larger clip is scaled down, and the price follows the resolution
- FIXED The settings say Codex makes images on the sign-in too; only video and audio still need a key

## [0.1.5] - 2026-10-04
- ADDED A wizard says which models it lacks before it runs, and only refuses to start when every path needs one; templates can be filtered by capability, and those this install cannot run are greyed out
- ADDED Codex makes images on the ChatGPT plan, and runs each model class on its own model (Luna, Sol, Astra); image, video and voice stay empty without a gateway key instead of naming models nothing can reach
- DOCS Plan for a setup by capability

## [0.1.4] - 2026-10-04
- FIXED The changelog's groups read NEW, FIXED, DOCS in every language, like the entries they stand before

## [0.1.3] - 2026-10-04
- FIXED **[release]** The publish job fetches the package artifact by name; with one artifact left it no longer lands in its own folder

## [0.1.2] - 2026-10-04
- ADDED A marketplace entry opens in the local studio at localhost:24368 instead of the Mac app's engenty-wizards:// link
- ADDED The Mac app is no longer built or offered; the studio offers to install itself as a Chrome app in a banner, starting at login on a Mac is a LaunchAgent that runs the command, and the setup, README and docs point there
- ADDED Engenty wizards starts at login — the Mac app opens in the menu bar without its window ("Open at Login" in its menus), on Linux a systemd user service; the setup asks, `engenty-wizards autostart on|off` switches it, and the Mac app's server takes port 24368 too
- ADDED The setup page installs a missing AI client in its own terminal, and both setups suggest the client whose app is on the Mac — its subscription is most likely already paid for
- FIXED An inline terminal's stream sends its last lines and its end before it closes; a page that opens it afterwards gets them all

## [0.1.1] - 2026-10-04
- ADDED The studio says when a newer release is out and, on an install made by wizards.sh, updates it from the footer
- ADDED The local runtime listens on 24368, AGENT on a phone keypad; the Docker image stays on 8891
- ADDED Wizards.sh opens with the tall engenty — one eye; it wakes up, looks around, hops and blinks
- ADDED The studio moves to /studio; the root of a host is free for a landing page
- ADDED The marketplace is an app of its own; the runtime searches it live and keeps its starters and the starred entries for offline use
- ADDED Engenty-wizards://new?starter=<id> opens a marketplace template in the desktop app
- DOCS The German tagline on the sign-in page follows the new one
- DOCS The tagline is "Make a wish. Get your wizard." In the README, the npm package description and the banner of wizards.sh.
- FIXED Ctrl-C stops engenty-wizards again — the login shell that reads the person's variables runs in a session of its own and no longer keeps the terminal

## [0.1.0] - 2026-10-04
- ADDED The desktop app is a window on the local install and brings no runtime along
- ADDED An installer, wizards.sh, that every runtime serves
- ADDED An engenty-wizards command for a local install in ~/.engenty/wizards
- ADDED A changelog and open-source credits in the studio's footer; pnpm release cuts a release from the commits
- ADDED Marketplace entries carry the words people ask for, so a search by words finds them
- ADDED One project unless the limit says more; an account page; previews and layouts in the project settings
- ADDED A project holds base infos, logos, colours, assets, documents and facts for all its wizards
- ADDED A template opens with its flow as a diagram; the gallery's field is narrower, its chips centred
- ADDED The gallery says what it is, compact and from the left; its search is a two-line field to write into
- ADDED The gallery opens with one question and the search field; quieter filter chips
- ADDED A marketplace of wizards to start from, with a gallery, admin, translation and search
- ADDED AI media is marked in its file and labelled with the EU icons (AI Act, Art. 50)
- ADDED Wizard packages carry their own extension, .wizard
- ADDED Wizards export as a package (.wizard.zip) and import into a project
- ADDED The editor pane's resize handle is a short, thick pill
- ADDED Chat composer takes files (+) and dictation
- ADDED Editor side pane resizable; Steps tab steps with ← / →, header and strip spacing fixed
- ADDED The arrow on a live wizard's card opens it in a new tab
- ADDED The AI clients page says it is an MCP server and sets a client up step by step
- ADDED Settings in sub-pages with a nav on the left (a dropdown on phones); MCP servers under Connectors
- ADDED Settings button in the top bar; the user menu closes on Einstellungen
- ADDED At most 5 projects per tenant
- ADDED Light / dark in the user menu, in place of the top bar's toggle
- ADDED Upload limits and sorting, pictures while a step works, faster photo steps, a feedback box on reviews
- ADDED Starters for receipts, video ad, property film, window offer, menu plan and ten website helpers
- ADDED Embed a wizard in a website, inline or behind a button that opens it in a window
- ADDED Wizards at /w/<token>, the app at the root of https://engenty.ai
- ADDED Serve the app under a path (https://engenty.ai/w)
- ADDED The drop engenty as app icon, tray icon and favicon
- ADDED Installed AI clients as the model of a local runtime, first-start setup as a wizard
- ADDED **[engenty]** Add furry and jelly renderers with an interactive builder
- ADDED Whole credits in the top bar, a footer line with the account's places
- ADDED Decision steps — yes/no and choice output fields, branches on step outputs
- ADDED Desktop app — Tauri shell with the runtime as a Node sidecar
- ADDED A database per tenant, model classes, sign-in at the Manage-App, phone inputs
- ADDED Engenty's built-in connectors — Gmail, Drive, Calendar, Contacts, Outlook, OneDrive, Slack, GitHub, HubSpot, S3
- ADDED Connectors from the integrations registry, asked-first changes in connected accounts
- ADDED Harden browser and file downloads, step navigation in the inspector, store and mailbox docs
- ADDED Light/dark mode with engenty-coloured dark pages, jelly and fur coats, quiet focus rings
- ADDED Lists and connections kept between runs, mail and browser tools, camera and ask panel
- ADDED Setup per AI client and a self-served plugin with /wizard
- ADDED Interactive widgets with a workspace per wizard, shareable results
- ADDED Live studio — MCP and other edits show up without a reload
- ADDED OAuth sign-in for MCP clients, connected apps in settings
- ADDED MCP endpoint for authoring wizards with personal API keys
- ADDED Engenty wizards — prompt-built AI wizards with shareable links
- CHANGED Pnpm workspace with apps/ and packages/
- DOCS Install with wizards.sh; the local install and how its pieces share it
- DOCS Plan for definition versions and importing older packages
- DOCS A README for people who install it, developer notes in docs/development.md
- FIXED The search skips filler words with umlauts too
- FIXED The gallery's footer stays without version, changelog and open-source links
- FIXED An entry's search terms are scored one by one, not as one long text
- FIXED The gallery has the studio's footer line
- FIXED The gallery's field is narrower
- FIXED A template's header is the dialog's own colour under a spotlight; in the light a tinted grey
- FIXED The marketplace search asks the model for the signed-in tenant; a sentence without a model keeps only close finds
- FIXED Two writers of the same blob no longer share a temporary file
- FIXED The project switcher switches the wizard list
- FIXED Photos reach an installed AI client, and a photo without text is described
- FIXED The editor at /edit/<id>, signed-out visitors of the start page go to SIGNED_OUT_URL
- FIXED The hosted addresses (engenty.ai) as defaults, no private repo names in the public sources
- FIXED A built runtime links to its own port, the sandbox falls back to agentOS
- FIXED **[setup]** No links to the clients' pages, a placeholder dot in the footer
- FIXED **[engenty]** Align vertical head turn with pointer gaze
- OTHER The gallery invites to start a wizard from a template
