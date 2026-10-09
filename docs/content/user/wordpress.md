---
title: WordPress
description: Put wizards on a WordPress site with the plugin "engenty wizards" — connect, read the site in, place a wizard, read results in the admin.
---

The plugin **engenty wizards** puts the wizards of an engenty.ai account on a WordPress site and
shows what visitors left in the WordPress admin. The wizards run on engenty.ai: WordPress keeps
its settings and the connection, no answers.

| | |
|---|---|
| WordPress | 6.6 or newer |
| PHP | 8.1 or newer, nothing else on the host |
| Account | Free or above on engenty.ai; Kontakte and Termine need Pro |

## Install

Download `engenty-wizards.zip` (Settings → Integrate → WordPress, or the
[releases](https://github.com/engenty/engenty-wizards-wordpress/releases/latest)) and upload it in
WordPress under **Plugins → Add New → Upload Plugin**. After activating it the menu **engenty**
opens.

## Connect

On **engenty → Übersicht**:

- **Eigene KI erstellen** makes a free account on engenty.ai, with the admin's e-mail filled in.
- **Anmelden** uses an account you have.

engenty.ai asks you to allow the site access and sends you back. The site is connected as you,
in the team you picked; **Einstellungen → Trennen** ends it and revokes the access.

**By hand:** for your own engenty server, or where signing in through the browser is not possible,
enter an address and an API Key under **Einstellungen → Von Hand verbinden**. On engenty.ai the key
is made under Konto, on your own server in the studio under Einbinden.

## Set up

After connecting, the overview walks through three steps.

| Step | What happens |
|---|---|
| Website einlesen | The plugin reads the site from inside WordPress: name, tagline, logo, the theme's colours, e-mail and phone from the imprint and contact pages, the shop's address with WooCommerce, and the published pages as text. You untick what should not go; the rest fills the space's details where they are empty and goes into its Wissen as pages. The space assistant then reads the imprint for address, VAT id and who runs the business |
| Ersten Wizard anlegen | A template becomes a wizard and goes live in one click |
| Auf die Website bringen | The bubble on every page, a new draft page with the wizard, or by hand (below) |

Reading the site and making wizards here needs a plan that builds on engenty.ai (Pro). On Free
you build in the [app on your computer](./install.md) and publish; the wizards then show in
WordPress.

## Put a wizard on a page

| Way | |
|---|---|
| Block **engenty Wizard** | Pick the wizard and how it shows: in the text, button + window, bubble. The editor shows the wizard itself |
| Shortcode | `[engenty_wizard id="ID" mode="modal" label="Anfrage starten"]` — `id` is the wizard's ID or the token of its link; `mode` is `inline`, `modal` or `bubble` |
| Elementor | The widget **engenty Wizard** with the block's choices |
| PHP | `<?php engenty_wizard( 'ID', [ 'mode' => 'inline' ] ); ?>` in a theme template |
| Bubble | **Einstellungen → Blase auf jeder Seite**: one wizard at the bottom right of every page but the ones you leave out, with an optional line beside it and your colour |

Each way writes the same tag as the share dialog's [website snippet](./test-and-share.md#embed-in-a-website),
with the page's address: a result says which page it was started on.

## Results, contacts, bookings

| Page | Shows | Plan |
|---|---|---|
| Ergebnisse | What visitors left: when, which wizard, the e-mail and first answers, the page; a result opens with all answers, what the wizard made and its downloads | every plan |
| Kontakte | The leads your wizards collected, with search and the wizard they came through | Pro, Team |
| Termine | Coming, past and cancelled bookings of the space's calendar | Pro, Team |

Who sees these pages is set under **Einstellungen → Zugriff** (administrators always, editors at
the start). Results of runs without an account are kept 7 days.

## Without an account

A WordPress 7.0 site with its own AI provider (WordPress → **Einstellungen → Connectors**: OpenAI,
Anthropic, Google, or Ollama through a provider plugin) runs wizards by itself: no account, no
credits, the provider bills the site's key. On **engenty → Übersicht**, "Eigene KI erstellen"
offers the account first and, below it, **Lokal, mit eigenem KI-Anbieter**.

| | |
|---|---|
| Wizards | The templates that ship with the plugin, picked from the gallery on the local setup's second step; or a package (`.wizard`) imported under **Wizards → Importieren**, downloaded from a wizard's share dialog in the studio |
| What runs | Pages with every field but voice notes, accounts and appointment times; thinking steps, with a web page or a public API as their tools where the step names `web_fetch` or `http` (WordPress abilities the site runs itself; off under **Einstellungen → Eigenständige Wizards**); decisions, branches and surfaces; reviews; documents and dashboards as HTML; results as HTML, Markdown, text, CSV or JSON, a PDF as the browser's print. Photos go to the provider where it takes images |
| What does not | Web search, the browser and code tools, connected accounts, the Pro plugins, films, images, video and voice made by a model, lists and memory, Word and Excel downloads |
| The check | The share dialog's WordPress section and the plugin's import say per wizard whether it runs there as is, with less or only with an account, in the gallery's words ("nicht eingerichtet", "geht auch ohne"). With less: a choice on a page that leads to something the site lacks is closed there ("Hier gerade nicht verfügbar"), a format falls away |
| Knowledge | The share dialog's **Wissen mitnehmen** puts the project's pages into the package as files (up to 2 MB); on the site the wizard reads them as it reads its own files, a snapshot of the day it was packed |
| From the account | On a connected site with a provider, a published wizard's drawer offers **Hier laufen lassen**: the package comes over with the site's key and runs on the site without credits; **Über engenty.ai laufen lassen** switches back, **Neu laden** fetches the published version again |
| Results | Kept in WordPress under **Ergebnisse** for as long as the settings say; nothing goes to engenty.ai |
| Limits | 6 runs an hour per visitor and 50 a day per wizard (**Einstellungen → Eigenständige Wizards**), a honeypot |

The browser follows the wizard's flow and draws every page; WordPress keeps the wizard's
prompts and the run and asks the provider once per thinking step through the AI Client. Both
kinds can be on one site: a connected site keeps contacts, bookings and files, a site without an
account still runs the simple ones.

## Privacy

Visitors talk to engenty.ai directly from the frame the wizard runs in. Name engenty in your
privacy statement; **Einstellungen → Datenschutz** has a sentence to start from. Standalone
wizards send the visitors' answers to the site's AI provider instead: the settings name it in
the sentence.
