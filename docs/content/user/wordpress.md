---
title: WordPress
description: Put wizards on a WordPress site with the plugin "engenty wizards" — connect, read the site in, place a wizard, read results in the admin.
version: 0.3.4
---

The plugin **engenty wizards** puts the wizards of an engenty.ai account on a WordPress site and
shows what visitors left in the WordPress admin. The wizards run on engenty.ai: WordPress keeps
its settings and the connection, no answers. On WordPress 7.0 a wizard can also run on the site
itself, with the site's own AI provider and no account ([below](#without-an-account)).

| | |
|---|---|
| WordPress | 6.6 or newer; 7.0 or newer for wizards without an account |
| PHP | 8.1 or newer, nothing else on the host |
| Site address | https, to sign in to engenty.ai from the admin |
| Account | Free or above on engenty.ai; Contacts and Appointments need Pro |

## Install

Download `engenty-wizards.zip` (in the studio under Settings → Integrate → WordPress, or from the
[releases](https://github.com/engenty/engenty-wizards-wp-plugin/releases/latest)) and upload it in
WordPress under **Plugins → Add New → Upload Plugin**. After activating it the menu **engenty**
opens.

## Connect

On **engenty → Overview**:

- **Create your own AI** offers a free account on engenty.ai: **Create a free account**.
- **Sign in**, under "Already have an engenty account?", uses an account you have.

engenty.ai asks you to allow the site access and sends you back; your WordPress e-mail goes along
as a suggestion. The site is then connected as you: **Settings → Connection** shows the account,
team and plan, and **Disconnect** ends the connection and revokes the access.

**By hand:** for your own engenty server, or where signing in through the browser does not work,
enter an **Address** and an **API key** under **Settings → Connect by hand**. On engenty.ai the key
is made under Account; on your own server under Settings → Integrate, with an app's "Connect
with the address and an API key" (see [AI apps](./ai-apps.md#an-app-on-another-computer)).

## Set up

After connecting, the overview walks through three steps.

| Step | What happens |
|---|---|
| Read the website | The plugin reads the site from inside WordPress: name, tagline, logo, the theme's colours, e-mail and phone from the imprint and contact pages, the shop's address with WooCommerce, and the published pages as text. You untick what should not go; the rest fills the space's details where they are empty and goes into its [Knowledge](./space.md#knowledge) as pages. The space assistant then reads the imprint and contact pages for the address, VAT ID, opening hours and who runs the business |
| Create the first wizard | A template becomes a wizard and goes live in one click |
| Put on the website | As a bubble on every page, on a new page (a draft with the wizard's block, for you to publish), or placed yourself (below) |

Reading the site and making wizards here needs Pro. On Free you build in the
[app on your computer](./install.md) and publish to your account; the wizards then show in
WordPress.

## Put a wizard on a page

| Way | |
|---|---|
| Block **engenty Wizard** | Pick the wizard and how it shows: **In the text**, **Button + window** or **Bubble bottom right**, with a label, a line beside the bubble and a colour. In the text, the editor shows a wizard from the account itself |
| Shortcode | `[engenty_wizard id="ID" mode="modal" label="Start a request"]` — `id` is the wizard's ID or the token of its link; `mode` is `inline`, `modal` or `bubble`; `text` and `color` as in the block |
| Elementor | The widget **engenty Wizard** with the block's choices |
| PHP | `<?php engenty_wizard( 'ID', [ 'mode' => 'inline' ] ); ?>` in a theme template |
| Bubble | **Settings → Bubble on every page**: one wizard at the bottom right of every page but the ones you leave out, with an optional line beside it and your colour |

A wizard's drawer under **Wizards** has the shortcode and the PHP line ready to copy. For a wizard
from the account, each way writes the share dialog's
[website tag](./test-and-share.md#embed-in-a-website) with the page's address: a result says
which page it was started on.

## Results, contacts, appointments

| Page | Shows | Plan |
|---|---|---|
| Results | What visitors left: when, which wizard, the e-mail and first answers, the page; a result opens with all answers, what the wizard made and its downloads | every plan |
| Contacts | The leads your wizards collected, with search and the wizard they came through | Pro, Team |
| Appointments | Upcoming, past and cancelled bookings of the space's calendar | Pro, Team |

Who sees these pages is set under **Settings → Access to results, contacts and appointments**
(administrators always, editors from the start). engenty.ai keeps a visitor's result 7 days.

## Without an account

A WordPress 7.0 site with its own AI provider (WordPress → **Settings → Connectors**: OpenAI,
Anthropic, Google, or Ollama through its provider plugin) runs wizards by itself: no account, no
credits, the provider bills the site's key. On **engenty → Overview**, **Create your own AI**
offers the account first and, below it, **Local, with your own AI provider**. **Set up locally**
then goes through three steps: the provider (with a test), the wizards, the website.

| | |
|---|---|
| Wizards | The templates that ship with the plugin, picked from the gallery; or a package (`.wizard`) from a wizard's share dialog in the studio (Website → "Without an account: as a package"), taken in with **Import** on the **Wizards** page |
| What runs | Pages and their fields; photos go to the provider where it takes images. Thinking steps, which read a web page or call a public API where the step names `web_fetch` or `http` (the site does that itself). Decisions, branches, reviews and surfaces. Documents and dashboards as HTML. Results as Markdown, text, CSV or JSON, HTML as a page to print, and a PDF of a written text made in the visitor's browser; a document's PDF is the browser's print |
| What does not | Voice notes, sign-ins to connected accounts, picking an appointment time, list fields, a file a later step reads; web search, the browser, code and image tools, MCP servers and plugin steps (Contacts, Appointments and the like); widgets, films, images, video and voice made by a model; lists and the wizard's memory; Word, Excel and other downloads |
| The check | The share dialog's package view and, in the plugin, the gallery, the **Wizards** page and the import say per wizard whether it runs there as is, with less, or only with an account, and list what it lacks in the gallery's words ("not set up", "works without"). With less: a choice on a page that leads to something the site lacks is closed there ("Not available here right now"), a format falls away. The import refuses only a wizard that needs an account; one that needs a plugin only behind a choice runs with less, that choice closed |
| Knowledge | The package view's **Take the knowledge along** puts the space's pages into the package as files (up to 2 MB, a page up to 60 000 characters): a snapshot of the day it was packed. On the site a thinking step gets the wizard's own text files first, then the pages that match the step best (its instructions and the answers so far), up to 60 000 characters in all |
| From the account | On a connected site with a provider, a published wizard's drawer offers **Run here**: its published version comes over and runs on the site with the site's provider, without credits, and its results stay in WordPress. **Run through engenty.ai** switches back, **Reload** fetches the published version again |
| Results | Kept in WordPress under **Results**, 90 days unless **Keep results** says otherwise; nothing goes to engenty.ai |
| Limits | 6 runs an hour per visitor and 50 a day per wizard, a honeypot; 60 seconds per thinking step, up to 600 for a slow local model (the setting reaches the Ollama provider plugin's own limit too) |

The settings for all of this are under **Settings → Standalone wizards**: the limits, how long
results are kept, photos to the provider, and the switch that lets wizards read web pages and call
public APIs. The browser follows the wizard's flow and draws every page; WordPress keeps the
wizard's prompts and the run and asks the provider for each thinking step through its AI Client.
Both kinds can be on one site: under **Wizards** the ones that run on the site are marked
**Local**.

## Privacy

Visitors talk to engenty.ai directly from the frame the wizard runs in. Name engenty in your
privacy statement; **Settings → Privacy** has a sentence to start from. Wizards that run on the
site send the visitors' answers to the site's AI provider instead: the settings give a sentence
that names it.
