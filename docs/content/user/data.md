---
title: Your data
description: Where wizards, results, files and keys are kept, how to back them up and how to start over.
version: 0.2.55
---

## Where it is

Everything of an install on your computer is in one folder:

```bash
~/.engenty/wizards/data
```

| In it | What |
|---|---|
| Databases | Your wizards, their versions, runs and results (a run from a website tag also keeps the page it was started on); what wizards keep for people |
| Files | Uploads, generated media, documents, the files of each wizard |
| A secret | Signs the studio's sign-in and links, and encrypts what is stored encrypted |

Keys you enter in the studio, and the sign-in of a linked account, are kept in the Keychain on a
Mac (as `engenty-wizards`); elsewhere encrypted in the data folder.

## Back up, move, start over

| To | Do |
|---|---|
| Back up | Stop the app (`wizards stop`) and copy the folder |
| Move to another computer | Install there, stop the app, put the folder in place. On a Mac, enter keys again and link your account again: the Keychain does not move |
| Start over | Delete the folder. On a Mac, keys in the Keychain stay and are used again; delete the `engenty-wizards` entries in Keychain Access to drop them |
| Keep it elsewhere | `ENGENTY_HOME` moves the whole install |

After an update, your data is brought up to date at the next start.

## What leaves your computer

- **Model calls** go to whatever the models run on: your AI client's provider, the provider of
  your key, or your engenty account. With Ollama, or Apple Intelligence on a Mac, they stay on
  your computer.
- **Steps that use the web** send what they search, open or call.
- **Connected services** get what a wizard's actions send them.
- **Published wizards**, with an account signed in: the published version, its files, the
  space's name, description, colours, facts and logo, and the space's own tables and pages go to
  engenty.ai when you publish ([Test and share](./test-and-share.md#in-the-cloud)). Documents,
  drafts, runs and connected accounts stay.
- **Templates** come from the marketplace at engenty.ai; `MARKETPLACE_URL=off` in the settings
  file turns that off.
- **The update check** asks GitHub for the newest release.
- **The studio's typefaces** are loaded by your browser from Google Fonts.
- **A location** is sent to a geocoder only if you set one. Unset, it stays coordinates.
- **`wizards report`** sends the status, model settings (never a key) and log lines to your
  account, only when you run it.

Without an account the app is not connected to an engenty account: wizards, the space and its
files stay on your computer.

## How long things are kept

| What | How long |
|---|---|
| Your wizards and your test runs | Until you delete them |
| A real run of a published wizard (over its link or from an AI app), its result and the result's shared link | 7 days |
| What a wizard keeps for a person: lists, files, connected accounts, sign-ins | Until they delete it, or 400 days after its last use |
| The space's tables and pages, and what wizards keep for every run: shared lists, pages | Until you delete them, or the wizard they belong to |

Connected accounts and kept sign-ins are stored encrypted.
