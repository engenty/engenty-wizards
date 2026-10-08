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
[releases](https://github.com/engenty/engenty-wordpress/releases/latest)) and upload it in
WordPress under **Plugins → Add New → Upload Plugin**. After activating it the menu **engenty**
opens.

## Connect

On **engenty → Übersicht**:

- **Eigene KI erstellen** makes a free account on engenty.ai, with the admin's e-mail filled in.
- **Anmelden** uses an account you have.

engenty.ai asks you to allow the site access and sends you back. The site is connected as you,
in the team you picked; **Einstellungen → Trennen** ends it and revokes the access.

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

## Privacy

Visitors talk to engenty.ai directly from the frame the wizard runs in. Name engenty in your
privacy statement; **Einstellungen → Datenschutz** has a sentence to start from.
