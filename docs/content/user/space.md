---
title: Space
description: What your wizards share and produce — who you are, what they look things up in, and the results of their runs.
---

The folder in the top bar opens your space: what all your wizards share, and what they produce.
Every AI step knows it, so a wizard never has to ask for your company's name or address.

The menu on the left shows the space's four parts; a part opens its own sections, the arrow at
the top leads back. On a phone the parts, a part's sections and the page take turns.

| Part | Sections | Used for |
|---|---|---|
| Info & brand | Basics, Logos, Colours, Assets, Facts | Who you are and how you look |
| Knowledge | All, then each Kategorie, then a plugin's sections (Sources) | What every AI step looks things up in |
| Data | All data, then each wizard | Tables and pages the wizards keep |
| Results | All results, then each wizard | The runs that reached their result |

## Info & brand

| Section | Holds | Used for |
|---|---|---|
| Basics | Title and "About": what you do, for whom, and the tone you write in | Texts sound like you. People who run a wizard see the title too |
| Logos | One or several, each with a description of what it is for | People see the main logo. The description tells a step what a variant is for |
| Colours | Named colours, each with a note on its use | The first colour is the accent of documents, dashboards and public pages |
| Assets | Images, graphics, videos, each with a description | AI steps place them in documents and choose by the description |
| Facts | Labelled values: address, VAT id, opening hours | Steps use them as written |

## Knowledge

The ground truth your wizards' steps look things up in: pages, tables and files. You see here
exactly what a step can find.

- **Documents become pages and tables when they arrive.** A PDF, a Word file or a scan becomes a
  page; the original stays behind it ("Original"), and the page marks where each page of it
  begins, so a step can quote "p. 2". A long document with headings of its own — a law, a
  manual — becomes a page with sub-pages, one per section; "§ 281" in the text links to that
  sub-page. A workbook becomes a table per sheet, a CSV one table. What cannot be read stays a
  file and is found by its name and description. A scan that read badly is marked "Check".
- **Kategorien keep things apart.** A Kategorie is a property with a type: a choice
  (Baustelle, Art der Förderung), a date, a number with its unit, a short text, yes / no. Set
  them on a page, a table or a file with the chips under its title; when a document arrives, a
  model fills them from what it reads. A table's column can be one. A step filters by them
  before it searches: "reports of Graz Süd in March" is a filter first.
- **Each value of a choice** has its contents — everything that has it — and an overview a model
  writes on request ("Write the overview"). The search finds the overview like a page.
- **Two spellings of one value** ("Graz-Süd", "Graz Süd") are offered for merging on the
  Kategorie's page. A Kategorie a source proposes stands as "Proposed" until you take it.
- **"Try a search …"** searches the way a step does: the filters first, then words and meaning,
  then a classifier asks of each hit whether it answers the question and keeps those that do,
  with how sure it is. Without a classifier the hits stay unchecked; it needs a Vercel AI Gateway
  or TypeSafe key, or an account. See [Models and account](./models.md).

A plugin such as Sources fills Knowledge from outside: a website, a sitemap, a folder of this
computer. What it wrote shows where it came from; once you change it, it stays yours and the
source no longer writes it.

## Data

Tables and pages the space's wizards keep, under the wizard they belong to. A wizard fills its
own: a shared list becomes one of its tables, and a step with the "Pages" tool writes its pages.
The columns of a shared list come from the wizard.

- **Table**: columns of a type (text, number, date, duration, choice, yes / no) and a row per
  line. Type into a cell; it is saved when you leave it. A value that does not fit the column is
  marked and not saved. The heading of a column changes its name and type, the plus beside the
  headings adds one.
- **Page**: a title and text in Markdown. "Write" edits it, "Preview" shows it; it is saved as
  you type.

### On a local install and in the cloud

Data stays where it was written. A wizard's tables and pages are filled where it runs: on this
computer by its runs here, in the cloud by the runs over its link. The pages and tables of
Knowledge, with their Kategorien, go to the cloud with every wizard you publish there, and are
shown there without being changed. Files stay on this computer.

## Results

Every run that reached its result, newest first: of all wizards, or of the one picked in the
menu, where the wizard with the latest result stands first. Search finds words in the wizard's
name, in what was answered and in what the run produced; the filters keep live or test runs and
the last 24 hours, 7 or 30 days. A run opens beside the list as the person saw it, with its
files.

## Have it filled in

The assistant above Info & brand and Knowledge fills the space for you. Tell it about yourselves,
name your website or give it files:

> Read our website example.com

It enters what it finds: title, description, logo, colours and facts. You correct the rest.

## One space

An install has one space. Its wizards, settings and files belong together.
