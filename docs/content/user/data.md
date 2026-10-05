---
title: Your data
description: Where wizards, results, files and keys are kept, how to back them up and how to start over.
---

## Where it is

Everything of an install on your computer is in one folder:

```bash
~/.engenty/wizards/data
```

| In it | What |
|---|---|
| Databases | Your wizards, their versions, runs and results; what wizards keep for people |
| Files | Uploads, generated media, documents, the files of each wizard |
| A secret | Signs the studio's sign-in and links, and encrypts what is stored encrypted |

Keys you enter in the studio are kept in the Keychain on a Mac; elsewhere encrypted in the data
folder.

## Back up, move, start over

| To | Do |
|---|---|
| Back up | Stop the app (`wizards stop`) and copy the folder |
| Move to another computer | Install there, stop the app, put the folder in place. Enter keys again on a Mac: the Keychain does not move |
| Start over | Delete the folder |
| Keep it elsewhere | `ENGENTY_HOME` moves the whole install |

After an update, your data is brought up to date at the next start.

## What leaves your computer

- **Model calls** go to whatever the models run on: your AI client's provider, the provider of
  your key, or your engenty account. With Ollama they stay on your computer.
- **Steps that use the web** send what they search, open or call.
- **Connected services** get what a wizard's actions send them.
- **Published wizards**, with an account signed in: the published version, its files, and the
  project's name, description and logo go to engenty.ai when you publish
  ([Test and share](./test-and-share.md#in-the-cloud)). Drafts, runs and connected accounts stay.
- **Templates** come from the marketplace at engenty.ai; `MARKETPLACE_URL=off` in the settings
  file turns that off.
- **The update check** asks GitHub for the newest release.
- **The studio's typefaces** are loaded by your browser from Google Fonts.
- **A location** is sent to a geocoder only if you set one. Unset, it stays coordinates.

Without an account the app is not connected to an engenty account: wizards, project data and
files stay on your computer.

## How long things are kept

| What | How long |
|---|---|
| Your wizards and your test runs | Until you delete them |
| A real run of a published wizard (over its link or from an AI app), its result and the result's shared link | 7 days |
| What a wizard keeps for a person: lists, files, connected accounts, sign-ins | Until they delete it, or 400 days after its last use |

Connected accounts and kept sign-ins are stored encrypted.
