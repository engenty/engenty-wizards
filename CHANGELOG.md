# Changelog

All notable changes to engenty wizards. Generated from [Conventional Commits](https://www.conventionalcommits.org/)
by [git-cliff](https://git-cliff.org) via `pnpm release`. Pre-`1.0`: a **minor**
bump is a notable or breaking change, **patch** is fixes and small features.

## [Unreleased]
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
- DOCS Plan for definition versions and importing older packages
- DOCS A README for people who install it, developer notes in docs/development.md
- FIXED The marketplace search asks the model for the signed-in tenant; a sentence without a model keeps only close finds
- FIXED Two writers of the same blob no longer share a temporary file
- FIXED The project switcher switches the wizard list
- FIXED Photos reach an installed AI client, and a photo without text is described
- FIXED The editor at /edit/<id>, signed-out visitors of the start page go to SIGNED_OUT_URL
- FIXED The hosted addresses (engenty.ai) as defaults, no private repo names in the public sources
- FIXED A built runtime links to its own port, the sandbox falls back to agentOS
- FIXED **[setup]** No links to the clients' pages, a placeholder dot in the footer
- FIXED **[engenty]** Align vertical head turn with pointer gaze
