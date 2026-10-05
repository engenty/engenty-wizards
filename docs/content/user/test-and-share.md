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

"Publish" makes the draft the live version. The editor's top bar says where you are:

| It says | Means |
|---|---|
| Not published yet | Only you can run it, as a test |
| Live · version 3 | The link runs this version |
| Unpublished changes | You changed the draft since. The link still runs the published version |

## Share

"Share" opens the wizard's link:

| Setting | Does |
|---|---|
| Link | The address people open. "Copy" puts it on the clipboard |
| Link is active | Switch it off and the link stops answering |
| Runs per day | How many runs the link allows a day. 50 unless you change it |
| Create a new link | Replaces the address. The old link stops working |

One visitor can start 6 runs an hour.

### Who can open the link

An install on your computer only answers on `localhost`: the link works on that computer, not
for anyone else. To let others run the wizard:

| Way | How |
|---|---|
| The cloud | In the share dialog, "In the cloud" → "Publish" puts the wizard into your engenty account. Its link there runs on the account's credits, also while your computer is off. Needs an [account](./models.md#account) |
| Your own server | [Run engenty wizards on a server](./server.md) with a public https address |

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
