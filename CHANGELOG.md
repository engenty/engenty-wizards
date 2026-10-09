# Changelog

All notable changes to engenty wizards. Generated from [Conventional Commits](https://www.conventionalcommits.org/)
by [git-cliff](https://git-cliff.org) via `pnpm release`. Pre-`1.0`: a **minor**
bump is a notable or breaking change, **patch** is fixes and small features.

## [0.2.36] - 2026-10-09
- ADDED **[studio]** The setup has a light · dark switch beside the language switch – dark stands on the blue ground as before, light on the studio's paper with white choices and the pick in the ground's blue; without a pick it follows the system, and the pick holds for the whole studio. The setup's copy writes engenty in lower case and without an article: "Womit soll engenty denken?"

## [0.2.35] - 2026-10-09
- FIXED **[studio]** A local studio's sign-in page names the command that lets a browser in, `wizards open`, instead of the link printed at start – a runtime started as a service prints nothing to a terminal

## [0.2.34] - 2026-10-09
- FIXED **[studio]** Someone signed in at engenty.ai who opens the studio is signed in to it by itself instead of being sent back to the landing page – the studio's start page sees the account's engenty_signed_in cookie and starts the sign-in, which goes through without a question; only visitors without an account go to the landing page

## [0.2.33] - 2026-10-09
- ADDED **[cli]** `wizards` on a terminal opens a menu – it shows what runs (address, pid, since when), whether it starts at login and whether a newer version is out, and offers start, start here, open the studio, restart, stop, update, start at login, connect AI apps, status, setup and help; with options or without a terminal it starts as before. New: `wizards restart` (one the command started starts again where it ran, any other is stopped and started as a service) and `wizards start --service` / `-s` (detached from the terminal, the command returns, output in logs/runtime.log); after an update the command says `wizards restart`

## [0.2.32] - 2026-10-09
- FIXED **[mcp-app]** The flow widget keeps a usable size and never goes blank – it is at least 360px tall from its first paint (the page root no longer holds the frame at full height, so a host can also shrink it), a runner that breaks leaves the diagram and panel instead of an empty frame, and the whole widget shows a short message if it cannot render at all; the docs say the runner reaches the runtime with the run's ticket and note that Cursor folds the widget into its "Worked for …" group (a known Cursor bug)

## [0.2.31] - 2026-10-08
- FIXED **[runtime]** Pictures from the web show in what a step makes – a generated page may load nothing from the network, so an <img src="https://…"> a model wrote or a photo URL in a widget's data (a listing's photos, a product's cover; by key or extension) stayed blank; now each is fetched once when the step runs through the public-only guard (image/* only, 8 MB, 10 s, up to 40 per step), kept as a web-image asset of the run and referred to as asset://ID, inlined wherever the page is shown or rendered to PNG, PDF or film; a picture that cannot be fetched is left as it was; the authoring guide says so

## [0.2.30] - 2026-10-08
- ADDED **[plugins]** Pro modules on a local install – the closed plugins the linked account's plan includes come from its Manage-App (/v1/modules) as zips signed for the release, checked against the public key the runtime ships with before anything is unpacked, and installed into <DATA_DIR>/pro-modules apart from the person's plugins; they load only while the entitlement the Manage-App signed lists them, belongs to the linked account and has not ended (a week offline), and only in the release they were built for, are fetched anew for a new release or build, and go off with the plan or the account while their files and tables stay; Settings → Plugins has a Pro modules section (install, update, remove, check the plan) and stays reachable for a linked account without plugins; concurrent refreshes of the account token share one request, so the start-up checks no longer refuse each other
- DOCS Plan for Pro modules in a local install – signed packages downloaded with the linked account, a signed entitlement that turns them on and off with the plan, what can and cannot be protected on the person's machine

## [0.2.29] - 2026-10-08
- ADDED **[engine]** An AI step can call one plugin tool without a model – call { tool, input } with the inputs filled from earlier answers (a whole number or true/false passed as one, an empty one left out), checked against the tool's schema, the answer kept as the step's json output (output.fields name the keys later steps read); it costs no credits, needs no model and answers as fast as the tool; the authoring guide and the plugin docs show it for free appointment times

## [0.2.28] - 2026-10-08
- ADDED **[marketplace]** The catalog knows which plugins a wizard needs and the plan that has them – an entry carries plugins (read from its tools named <plugin>.<tool>), plan (free, or pro as soon as it uses a plugin) and the plugin starter it stands for; searching filters by plan with its counts; a runtime with the plugin lists the plugin's own starter and leaves out the entry for it, one without marks the entry with what it needs and refuses to start it; the studio shows Pro on such templates, a Paket filter beside the others and what is missing, list_starters says needsPro

## [0.2.27] - 2026-10-08
- ADDED **[ui]** A time picker in the studio's look – a field that opens an hour and a minute column below it, arrow keys move the time by its step, compact without the clock for narrow rows; the plugin docs list it with the page menu and the composer
- ADDED **[plugins]** What a booking plugin needs from the runtime – a plugin connects accounts of the space itself (server.connections: start, list, call, remove, with the shared sign-in callback and token refresh), brings starters to the marketplace (registerStarter), learns whether a step runs as a test (step.mode) and in which wizard, and tells the space assistant what its own page holds (registerAssistantContext), where the assistant now stands docked (studio.Assistant) and the page names its place in the top bar's trail (studio.useCrumbs); a page field of kind slot offers free times as chips by day; the studio has a date picker and a date range picker, a composer shared by every chat (a pill on one line, the buttons level with the text, a menu beside the mic to choose the microphone and to hold to record) that floats docked over a blurred band clear of a phone's home bar, and a page menu that slides one level down at the side and becomes tabs on a phone; Google Calendar and Outlook events take a location, Google's an invitation to send and Outlook lists every event with its free/busy; the first slash of the trail stands as close to the wordmark as the others

## [0.2.26] - 2026-10-08
- ADDED The wizard editor has a Memory tab – the wizard's part of the space data, the notes its AI steps keep with the pages tool and the tables of its shared lists, a short list that opens each in the space's own editor, with a new note at hand; a test run reads the memory but writes into a copy of its own in the run, which goes with it; files dropped on the Files tab are uploaded and files dropped on the conversation are attached to the next message, each with a drop sign over the pane; the Files and Memory explanations sit small at the foot of their pane; holding to delete takes 1.2 seconds; costs say credits instead of cr
- ADDED A view step shows a preview of itself with sample data in the shape of what it reads (a kept list's rows by its columns, an AI step's table and fields by their kind), and a small button in its corner turns it into its JSON with highlighting, edited in place and kept when it is valid; deleting a step takes holding its button for two seconds while it fills up, a short press says to hold; the step panel's resize grip sits outside the panel beside its edge, clear of its scrollbar
- ADDED A step can be added that only some runs take – the add-step prompt asks when the step comes (always, only if a condition the admin writes in their own words holds, or when the AI finds a statement true) and the assistant builds it as a side path; a branch with only a target is now the step's "otherwise", where every run goes that no other branch takes, so a side step rejoins the flow – the engine, decided branches and the required-steps checks follow it, the step panel shows and edits its target, the diagram labels it and draws no plain line beside it; the diagram's add action is now "Add step" on the selected step's lower edge instead of a + on every line, and the step panel's button says the same
- ADDED A step is added by saying what it should do – the step panel's one-line footer opens a prompt (and a + on a line in the diagram does too) where the admin describes the step and picks its kind or leaves it to the AI; the request goes to the conversation as the admin's message, the new step is shown in its place as being built and selected once the assistant has built it completely (a widget with its HTML and sample data); an empty step can still be inserted; a widget without its HTML offers to let the assistant build it or to upload an HTML file instead of a dead end
- ADDED The step panel shows where the run goes next – a step without branches shows the step that follows, folded to its title and unfolding to what it asks or makes, its cost and where it leads; a step with branches lists one row per way (conditions, the statements the AI decides, otherwise) with its target, each unfolding to edit it, and conditions can now be added and edited there too; how a decision is made moved into the AI chip's hint; a test run's decision is shown only while the step's branches are still the ones it decided over
- ADDED A wizard's branches can be inspected in the studio – a click on a branch line in the diagram opens the step's branches: its conditions in the order they are checked, the statements the AI decides together in one call with their target steps, where the run goes when none clearly holds, how it is decided and how often a loop may run; statements can be edited, added and removed there; after a test run the diagram marks the branch the decision took with how probable it found it, and the step shows the probability of each statement and whether a decision model or the language model decided
- ADDED A wizard can show what a run found in its own look – a new step type "surface" (a view) is built from a fixed set of native parts (text, facts, key figures, lists with pictures, tables, bar, line and ring charts, buttons) bound to the run's answers, results and kept lists, written once by the assistant and free on every run; a view can leave some of its parts to the AI, which shows a chart only when there is something to compare; an AI step with json output can lay out a view of its own result, checked against the parts before it is kept; reviews and the result page show a step's view instead of a plain table, a view's button can ask for a new version in a review or open a file, and a view downloads as JSON
- ADDED The AI can decide how a wizard goes on and which questions it asks – a branch can carry a statement instead of a condition ("the person wants a refund") and all such branches of a step are decided together in one small call, a field can be shown when the AI finds a statement true and fields of a group are alternatives of which it shows the one that fits, decided once as the run reaches the page; every decision goes to a decision model where there is a way to one (Jev through the credits, an AI Gateway key or a TypeSafe key) and otherwise to the classifier class's language model, so decision steps now carry how probable their answers are (branches read it as steps.<id>.<field>.p) and Wissen's relevance check works without Jev; decision steps answer scores on a scale; a branch back to an earlier step is a loop that stops after its max (ten without one) and the step that runs again sees what it made last time; an AI step can run once per row of a table or a kept list and hands on one table of the results
- ADDED A field can be shown only under a condition – it appears as the person answers another field of the same page, or depends on anything known before the page – and a hidden field is neither required nor kept; the choices of a select can come from earlier data (a list an AI step found, a column of its table, or a column of a list the wizard keeps), with the fixed choices standing in while that data is empty; branches compare numbers (greater, less), look into multiselects, lists and texts (contains), read how many rows a kept list has, and take several conditions that must all hold; the studio edits a field's condition and the source of its choices, the diagram labels the new conditions, and the assistant is told to use conditions instead of one copy of a page per answer
- ADDED Gmail, Drive, Calendar and Contacts connect on a local install without a Google client of its own: through the linked engenty account, which holds the client and refreshes the tokens; before an account is linked, connecting asks to link it first

## [0.2.25] - 2026-10-07
- FIXED Connecting a mailbox over IMAP finds Google Workspace on a company domain through its MX record, gives up after 15 seconds instead of spinning, and a failed connect names the server it tried and says what to check

## [0.2.24] - 2026-10-06
- ADDED A run opened in the drawer (editor test runs and the space's results) can be dragged wider or narrower at its left edge – arrow keys too, a double click resets – and an expand button in its bar makes it fill the browser window; width and expansion are remembered per browser

## [0.2.23] - 2026-10-06
- FIXED A wizard's brand colour no longer makes its buttons unreadable: the text on a button is light or dark by the button's own colour, not by the theme (a black accent in dark mode got dark text), and ember as text and marks on the page keeps a lightness the paper can carry; the selected chip of an output follows the same rule instead of always white

## [0.2.22] - 2026-10-06
- FIXED A model an own AI Gateway key may not use is found before a run starts, not after minutes of work: the check before a run (and the runtime's start, and the Models page) asks Vercel once per key and model with a call of a token or a word – a refusal of the free tier costs nothing, is asked again after five minutes so a top-up counts, and an allowed model is not asked again for a day; videos and images not made by a chat model cannot be asked that cheaply, there a refusal a run met counts; a step refused for the free tier says so and how to fix it (top up at Vercel, with the link, or pick another way under Einstellungen → Modelle) instead of Vercel's raw message, and web addresses in a run's error, the editor's missing-models notice and the Models page are links

## [0.2.21] - 2026-10-06
- ADDED A wizard can make a film with Claude Code: the new step type "film" lets the AI client installed on this computer write a motion-graphics film as code in a folder of its own – with HyperFrames' skills (fetched once from GitHub at a pinned version), the wizard's style kit (a .zip in its workspace, unpacked as the bar to reach), the space's brand (name, colours named by use, facts, logos) and the run's material (voice, script, pictures, uploads) – and the runtime renders the MP4 with HyperFrames (installed into the data folder on the first film); the client's shell runs in its sandbox, writing only inside the folder and without network, and reaches HyperFrames' render, snapshots and checks through a tool of the step limited to the folder; sounds come only from a catalog of CC0 effects (soundcn by Kenney, HyperFrames' own); a film runs only where Claude Code is the AI subscription, never on credits or in the cloud, the runner says so before a run starts and the marketplace shows it as a capability; a film that stops picks up the client's session on the next try, a failed final render goes back to the client to fix, and a review's note changes the film's code instead of making it again; the folder goes with the run's files

## [0.2.20] - 2026-10-06
- ADDED A team's plan reaches the runtime: the Manage-App names the plan, its feature switches and the people it allows, and a count of spaces may be unbounded (null); in a team the owner and the admins make and delete wizards, spaces and connectors while a member edits, tests and publishes the wizards there are – enforced in the services for studio, API and MCP alike (403 forbidden); the settings get a Team page with the plan, the places and who is in the team, managed at the Manage-App; own API keys in the cloud studio are a feature of the plan; and the Manage-App learns which plugins a runtime carries (GET /api/internal/plugins)

## [0.2.19] - 2026-10-06
- ADDED The gallery has three more categories (Bilder & Video, Anfragen & Termine, Beratung & Preise) so the category row fills two even rows

## [0.2.18] - 2026-10-06
- ADDED Wissen in the space: what the space's wizards look things up in, as pages with sub-pages, tables and files sorted by typed Kategorien (choice, date, number, text, yes/no), filtered by them and searched by words and meaning, with a classifier that keeps only what answers the question; an upload is converted on arrival (a long document becomes a page with sub-pages, a sheet a table, the original stays beside it) and a model fills its Kategorien; every value of a Kategorie has its Übersicht and its entries, numbers in ranges; steps get project_search with a filter, project_list, page_read and table_read by path; the assistant docks at the bottom of an opened item and knows Wissen; plugins write into Wissen through server.spaceData (pages, tables, files, documents with their Kategorien), and what a person edits stays theirs

## [0.2.17] - 2026-10-06
- FIXED A run's price follows one way through the wizard instead of adding up branches that exclude each other, and leaves out the steps that have no model here (the video ad: about 111 credits with clips, 11 without a video model, was 207 either way); what a step reports while it works shows in the language the person reads, the run's log keeps it in German; English wizards write amounts and today's date the English way (€2,400.00) instead of the German one

## [0.2.16] - 2026-10-06
- ADDED A wizard that needs a model not set up here says so before anything is paid for: in the gallery, video, speech output or voice notes that only some answers need no longer block a template ("Works without: …"); on its pages, the choices that would lead to such a step are locked with the reason and the default moves to one that works, an optional voice note nothing here can listen to gives way to the reason, and the server refuses those answers

## [0.2.15] - 2026-10-06
- ADDED On phones and small tablets the editor's pane is a bottom sheet whose height is dragged at its handle, touch included; a tap on the handle folds it to its tabs and unfolds it to the height it had, a step tapped in the diagram or a tab unfolds it too, and the height is remembered per browser; the sheet and the diagram now fit the screen, so the chat's input is no longer cut off at the bottom
- FIXED **[mobile]** A saved wizard whose link is gone (a new link, or the wizard deleted) shows as unavailable instead of offering Start into the runner's not-found page

## [0.2.14] - 2026-10-06
- FIXED "What's new" in the banner about a newer release opens the changelog of that release in the studio instead of its page on GitHub; offline it shows the changelog this version came with

## [0.2.13] - 2026-10-06
- ADDED The space opens behind the folder in the top bar and has four parts in the settings' sliding menu: Info & Marke (Basis, Logos, Farben, Assets, Fakten), Wissen (Dokumente), Daten and Ergebnisse; Daten holds tables with typed columns, edited cell by cell, and Markdown pages, of the space or of one of its wizards; a wizard's list can be shared, one table for every run that the person running it never sees, and a step with the new Pages tool writes the wizard's pages; the space's own tables and pages go to the cloud with each published wizard and are read-only there, while what runs write stays where they ran; Ergebnisse lists the finished runs of all wizards or of one, the wizard with the latest result first, with search, live or test and the last days; a plugin's section of the space chooses its part; the studio is a step smaller on laptops and nearer the edge on phones; the run-log example no longer adds an icon to the top bar

## [0.2.12] - 2026-10-06
- FIXED The documentation deploys like the cloud runtime: its image is built on GitHub's runners beside the checks of a release tag and pushed to GHCR, and the server only pulls it (deploy/Dockerfile.docs, built with --pull); the docs Dockerfile keeps its install cached across releases; a change of the docs image no longer redeploys the runtime

## [0.2.11] - 2026-10-06
- FIXED The cloud runtime deploys in minutes: its two images are built on GitHub's runners beside the checks of a release tag, with their layers cached in the registry, and pushed to GHCR; once both are green they become latest and the server pulls them instead of building for up to an hour; the runtime's Dockerfile keeps both dependency installs cached across releases (the root version blanked out, the production install in its own stage) and puts what changes every release last; IMAGE_TAG on the server pins a release

## [0.2.10] - 2026-10-06
- FIXED Signing in from the studio returns to the studio page that asked for it, not to the host's root, which is the landing page since the studio moved to /studio

## [0.2.9] - 2026-10-06
- ADDED Plugins add to the space: sections of the space page under the plugin's name in its menu, tools of the space assistant whose results the plugin draws as cards in its chat, a block and tools for every AI step of the space, texts in the space's search index that project_search finds beside its documents, events when a space is made, changed or deleted and when a file is read or removed, jobs that run on a schedule, public routes under an address of their own, and the runtime's web reader and document parser; the run-log example shows a space's last runs on the space page; the plugin docs describe the space

## [0.2.8] - 2026-10-06
- ADDED Settings → Models says what the wizards can do (text, images, videos, voice, voice notes) and who does each: an AI subscription on this computer, an own API key (OpenAI, Anthropic, Google, fal.ai, ElevenLabs, Replicate, AI Gateway), a local model, or the credits, which step in where nothing of one's own is set up (a switch, on with a linked account) and may name a model of the gateway (credits:<model>: fal, ElevenLabs, Veo …); each provider's key is checked with the provider before it is kept, and a try makes a text, an image, a voice or a short clip to look at; in the cloud the page is the team's, its keys sealed per tenant and changed by its admins; voice notes run on transcription models (Scribe, Whisper) where one is bound, also on the credits; the settings show their name in the top bar's trail instead of a heading, and one container on the left slides one level down to the menu of Models and Integrate and back; on a phone the sections, a section's menu and the page take turns with a way back; Integrate puts the app's name, what it gets and its steps on one line

## [0.2.7] - 2026-10-06
- ADDED The space is a page of its own: the top bar opens it beside the gear, and a menu at its left jumps to Basis, Logos, Farben, Assets, Dokumente and Fakten and marks the one in view (a picker on a phone); the studio, its assistant and the docs call a project a space (German „Space“), the address is /space and /settings/project leads there; the settings keep Konto, Connectors, Modelle and Einbinden, and the gear opens Konto; the assistant's input is one line until the text needs more, in its card and docked at the bottom

## [0.2.6] - 2026-10-06
- ADDED A wizard's link installs and bookmarks with the wizard's own icon: its engenty in its own colour on a pale ground of that colour with its name in small capitals below, drawn by the runtime for the manifest, the iPhone's home screen and phones that cut icons to their own shape; the page's favicon is the engenty alone, so a bookmark or tab shows it too; the name keeps the whole words that fit and never ends on a short word like "aus"; the studio's icon stands in where the runtime cannot draw; on a computer the start page offers a bookmark (⌘ D or Strg + D) instead of an install, phones keep "Zum Startbildschirm hinzufügen"

## [0.2.5] - 2026-10-06
- ADDED A local install says where each wizard runs and which link others can open: the cards and the editor's top bar show Live with a cloud when engenty.ai runs the version, Lokal when it runs only on this computer, Wird gesendet or Nicht in der Cloud when it did not arrive; a card's Link copies the cloud's address; the share dialog leads with that one link, says on top where the wizard runs and what the cloud lacks, folds website, QR code and the settings away, and creates a new link in the cloud too; the avatar and its menu show whether an account is connected, with its credits; Settings → Konto puts engenty.ai first and takes name and e-mail from the account; without an account the share dialog, a card's Link and the note about missing models say what an account would add

## [0.2.4] - 2026-10-05
- FIXED A wizard a local install sends arrives whole or not at all, and the install sends again by itself: the cloud runtime keeps the files' bytes first and writes the project, the wizard, its workspace, the version and the logo in one transaction, so an object store that fails in the middle leaves nothing half done; the install plans another try after a minute, then twice as long each time up to an hour, when the cloud was out of reach or answered with an error of its own, and the share dialog says when; refusals stay with the person; a first sync that stops at an unreachable cloud marks the remaining wizards for the retry too; the public link is set on every sync; the runtime asks GitHub for a newer release once an hour instead of every six

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
