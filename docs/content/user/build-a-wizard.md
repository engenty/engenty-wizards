---
title: Build a wizard
description: Describe what the wizard should do, or start from a template. Then change it in the conversation or step by step.
---

## Start one

"New wizard" on the studio's first page gives three ways in:

| Way | How |
|---|---|
| Describe it | Answer "What should your wizard do?" in your own words and press "Build wizard" |
| A template | Pick one below the text field. Search, or narrow by industry, result and capability |
| A package | "Import a wizard package" takes a `.wizard` file someone exported |

A description that works says who enters what, what the wizard does with it, and what comes out:

> Customers enter their product and audience, the wizard researches competitors and writes a
> positioning briefing as a PDF.

You can change everything afterwards.

### Templates

- A template shows how the wizard runs, how long a run takes, what it costs and what it needs
  before you start from it.
- "Not set up here" names a model this install has no way to yet, for example video. Set it up
  under [Models & account](./models.md), or pick another template.
- A star keeps a template on this computer, ready without a connection.
- A wizard started from a template is your copy. Later changes to the template do not touch it.

## The editor

| Part | What it is for |
|---|---|
| The diagram, left | The steps as a flow with their branches. Click a step to open it |
| Conversation | Say what should change. The assistant edits the flow and tells you what it did |
| Steps | One step at a time: its texts, fields, tools and model class. Move it up or down, or delete it |
| Files | What the wizard needs on every run: widget code, libraries, price lists. Upload your own or let the assistant write them |
| Runs | The test runs and live runs of this wizard |

### In the conversation

- Write what should be different: "Ask for the delivery date on the first page", "Add a review
  before the PDF".
- Attach files the assistant should look at: an example document, a price list, a screenshot.
- Dictate instead of typing with the microphone button.
- If the connection drops, what was already built is saved. Send the message again.

### Step by step

Open a step from the diagram or under "Steps". What you can set depends on its type: see
[Steps](./steps.md).

## When the wizard needs fixes

A draft may be incomplete while you work on it. Before you test or share, the editor lists what
is missing, for example a step that uses an answer asked only later, or a tool that is not
installed here.
"Let the assistant fix it" hands that list to the conversation.

If a step needs a model this install has no way to, the editor says which. A wizard whose every
path needs it cannot start; if only one branch needs it, choose another path when testing.

## What makes a good wizard

- Write for people who are not technical: plain words, titles phrased as questions.
- Few pages, one theme per page, at most five fields. Ask only what the result needs.
- Put a review before anything expensive, such as video, and before the final result.
- Let the phone do the typing: a photo instead of a description, the location instead of an
  address form, a voice note instead of a long text.
- Money belongs in a line-items field. The wizard computes net, VAT and total itself; a model
  never does.
- Facts from the web need a research step before the step that writes.

## Take it with you

The download icon in the editor's top bar exports the wizard as a package (`.wizard`): its steps
and its files. "Import" on the first page of any studio takes it in.
