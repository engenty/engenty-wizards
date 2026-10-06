---
title: Test and share
description: Try the wizard, publish it, and hand out its link or put it on a website.
---

## Test

"Test" in the editor starts a run of the draft, as a person would see it. Test runs are listed
under "Runs". A test spends what a real run spends: your model's usage, or credits.

Where runs spend credits, each AI step shows an estimate. It is a formula at first and is
measured from the latest runs after five of them.

## Publish

"Publish" makes the draft the live version. The editor's top bar and the wizard's card on the
start page say where it runs:

| It says | Means |
|---|---|
| Not published yet · Draft | Only you can run it, as a test |
| Live · version 3 | The link runs this version. With a cloud icon: on engenty.ai, for everyone with the link |
| Live · 1 note | It runs in the cloud, one step there with less (see "Share") |
| Local | Published on an install without an account: the link answers only on this computer |
| Being sent | The version did not reach engenty.ai yet; the studio tries again by itself |
| Not in the cloud | engenty.ai does not run this version. "Share" says why and what helps |
| Unpublished changes | You changed the draft since. The link still runs the published version |

On a card, "Link" copies the address others can open, and the arrow opens it. A wizard that
runs only on this computer has no address for others: its "Link" says so and how an account
gives it one, and the arrow opens it here.

## Share

"Share" says on top where the wizard runs, then gives its link:

| Part | Does |
|---|---|
| Link | The address people open. "Copy" puts it on the clipboard, "Open" opens it |
| Website | The tag for a website (see below) |
| QR code | The link as a QR code, and the wizard's ID for the mobile app |
| Settings | One line, "on · 50 a day", that folds out: |
| · Link is active | Switch it off and the link stops answering |
| · Runs per day | How many runs the link allows a day. 50 unless you change it |
| · Create a new link | Replaces the address. The old link stops working, in the cloud too |

Where the draft is not published as it is, the dialog says so first and publishes from there.

One visitor can start 6 runs an hour.

### Who can open the link

An install on your computer only answers on `localhost`: the link works on that computer, not
for anyone else. To let others run the wizard:

| Way | How |
|---|---|
| The cloud | With an [account](./models.md#account) signed in, "Publish" also sends the version to engenty.ai. Its link there runs on the account's credits, also while your computer is off |
| Your own server | [Run engenty wizards on a server](./server.md) with a public https address |

### In the cloud

Once an account is signed in under Settings → Account, every "Publish" sends the published
version to engenty.ai. The avatar then carries a small cloud, and its menu says "Connected to
engenty.ai" with the credits. The share dialog gives the wizard's address at engenty.ai, which
stays the same when you publish again; "Test on this computer" at its foot opens the copy on
your computer. On top it says:

| It shows | Means |
|---|---|
| "Live on engenty.ai · version 3" | The cloud runs this version |
| "Version 3 does not run in the cloud" | Something the wizard needs is missing there. The list says what; the version before keeps running |
| "What runs differently in the cloud" | A step works there with less, for example without a machine for code |
| "Send again" | The last sending did not arrive, or the project changed. When engenty.ai was the trouble, the studio tries again by itself and says when |

Without an account the dialog says that the wizard runs only on this computer, and offers to
sign in or create an account. "Website" and "QR code" are there too, marked with a cloud: they
need an address everyone reaches, and say so.

What goes and what stays:

| Goes to the cloud | Stays on your computer |
|---|---|
| The published version and its files | Drafts and the chat with the assistant |
| The project's name, what it says about itself, its logo | Runs and results of your computer |
| How the link is shared: on or off, runs a day | Connected accounts, keys, the project's documents and MCP servers |

At engenty.ai/studio you see the project and its runs there. It is changed on your computer:
the studio there edits nothing. An account holds one project of one computer. On a new computer
the share dialog offers to replace the project of the old one, which removes its wizards and
their links from the cloud.

Deleting a wizard here removes its copy; switching its link off here switches it off there.

### Embed in a website

The share dialog gives a tag to paste into a page's HTML:

| Mode | Shows |
|---|---|
| Inline | The wizard in that place of the page, as tall as its content |
| Button + modal | A button in that place that opens the wizard in a window over the page |

```html
<script async src="https://example.com/embed.js" data-wizard="TOKEN"></script>
<script async src="https://example.com/embed.js" data-wizard="TOKEN" data-mode="modal" data-label="Start"></script>
```

The button takes your website's own styles through the class `engenty-wizard-button`.

## Results people share

On the result page a person can share what they got as a link. The result of a run over the
wizard's link, and the link to it, are deleted after 7 days. The person can withdraw the link
earlier.

## Move a wizard

Export it as a package (`.wizard`) from the editor and import it in another studio. See
[Build a wizard](./build-a-wizard.md#take-it-with-you).
