---
title: Steps
description: What a wizard is made of — pages, AI steps, generated media, widgets, reviews and the result.
---

A wizard runs its steps from top to bottom. The last step is always the result.

| Step | What it does |
|---|---|
| Page | Asks the person: one to five fields |
| AI step | Does a task with tools: research, read documents, call an API, work in a connected service |
| Generate | Makes one thing: an image, a video, a voice-over, a document or a dashboard |
| Widget | Shows an interactive view built once for this wizard: a map, a timeline, a calculator, a film |
| Review | Shows what earlier steps made. The person accepts it, edits it or asks for a new version |
| Result | The last page: what the person can download or share |

## Pages

A page has a title, up to five fields and a button. Each field has a kind:

| Kind | The person |
|---|---|
| Text, long text, number, date, e-mail, link | types a value |
| Select, multi-select, toggle, colour | picks |
| Image | takes or uploads photos, one or several, in an order they can change |
| File | uploads documents; the camera can scan papers and record a short clip |
| Line items | fills rows with amounts. The wizard computes net, VAT and total |
| Location | taps "Use my location" or types an address |
| Voice note | records up to 5 minutes. The wizard writes down what was said before the next step reads it |
| Signature | signs with a finger |
| Connection | connects their own account of a service, for example their mailbox |
| List | checks, corrects and extends a list the wizard keeps for them |

A text field can have a "Scan" button that fills it from a QR code or barcode.

A field can start with a value an earlier step proposed. A line-items field, for example, shows
the positions an AI step looked up, for the person to correct.

## AI steps

An AI step has instructions and the tools you allow it:

| Tool | Lets the step |
|---|---|
| Web search | search the web |
| Read web pages | open and read a page |
| Browser | click and type on websites, take screenshots, download files. A login is typed by the person; the model never sees it |
| Code & shell | run code in a sandbox, where the install has one |
| Images | make images while it works |
| API | call an HTTP API |
| Pages | write pages of the wizard in Markdown, kept for every later run, and read them and the space's own pages |

Every AI step can also read and write the wizard's lists, list its files and read documents:
PDFs, scans and photos, Word, Excel, CSV and saved mails.

Further tools come from three places:

- **Connections** the wizard declares: the step gets the service's actions as tools. See
  [Connectors](./connectors.md).
- **Connected systems (MCP)** of the space, where you allow them on the step.
- **Plugins** installed in this app. See [Plugins](./plugins.md).

### Model class

A step names the kind of model it needs, never a model:

| Class | For |
|---|---|
| Classifier | Routing, yes/no, picking from options, pulling a few values out of text. Cheapest |
| Standard | Short copy, calling an API, reformatting |
| High | Research with tools, long documents, weighing many sources. The default |
| Highest | Hard reasoning or code. Several times the cost of High |

Images, video, voice notes and voice-overs have classes of their own. Which model serves a class
is set under [Models & account](./models.md). "Thinking effort" tells the model how hard to
think; leave it on "Automatic" unless a step is clearly trivial or clearly hard.

### What a step hands on

A step's output is text, Markdown or structured data with named fields: a text, a number, a
list, a table, a yes/no answer or a choice. Later steps use these, and branches decide on them.

## Generate

| Makes | Options |
|---|---|
| Image | Aspect ratio, style, a reference image to start from |
| Video | Aspect ratio, 4 to 10 seconds, 720p or 480p, a reference image |
| Voice | The exact text read aloud, and how to speak it |
| Document | A template: invoice, offer, briefing, letter, report or free |
| Dashboard | An HTML page with the figures of earlier steps |

An image or video step can make one result per entry, at most eight: per uploaded photo, per
image of an earlier step, or per row of a table. In a review the person can have single results
made again.

## Widgets

A widget is an interactive HTML view written once into the wizard's files. Every run only brings
new data, so it costs nothing to show and looks the same every time. With "video" switched on it
is a film: its timeline is rendered to an MP4 with sound.

## Reviews

A review shows earlier outputs. Depending on its settings the person can edit text, or ask for a
new version with a note on what should change. A list shown in a review is edited in place; a
list with files is checked row by row, each row beside its document.

## The result

Each entry of the result page names a step and the formats the person can download:

| From | Formats |
|---|---|
| Image | PNG |
| Video | MP4 (several: a ZIP) |
| Voice | MP3 |
| Document | PDF, Word, HTML, Markdown, PNG |
| Dashboard | HTML, PDF, PNG |
| Widget | HTML, PNG, PDF, JSON; MP4 when it animates |
| AI step, text | Markdown, text, Word, PDF, HTML |
| AI step, data | JSON, CSV, Excel, Markdown |
| AI step, collected files | ZIP |
| List | Excel, CSV, JSON, Markdown; ZIP with the files its rows name |

## Branches

A step can send the run somewhere else when a condition holds: a field equals a value, is one of
several, is filled in or empty. The first branch that matches wins; otherwise the next step
follows. The diagram draws the branches with their conditions.

## What a wizard keeps

- **Lists** hold rows between runs, separately for each person who runs the wizard: the
  receipts already booked, the customers already written to.
- **Shared lists** hold one set of rows for every run: requests, sign-ups, a log. The person
  running the wizard never sees them; you find them under Space → Data, below the wizard.
- **Connected accounts and sign-ins** are kept for the person's next run.

The person sees and deletes all of it under "What this wizard remembers". See
[Run a wizard](./run.md).

## AI media

Images, clips, voice-overs and films a model made or changed carry a marking in their file, and
every page lays an "AI generated" or "AI modified" label over them (EU AI Act, Art. 50). Nothing
is drawn into an image. A film shows the label in the picture, since it leaves the page as a
video file.
