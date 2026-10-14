---
title: Test and share
description: Try the wizard, publish it, and hand out its link or put it on a website.
version: 0.4.4
---

## Test

"Test" in the editor starts a run of the draft, as a person would see it. Test runs are listed
under "Runs". A test spends what a real run spends: your model's usage, or credits. A test run
reads the wizard's memory but writes into a copy of its own, which goes with the run.

Where runs spend credits, each AI step shows an estimate. It is a formula at first and is
measured from the latest runs after five of them.

## Publish

While a wizard is a draft, the editor's top bar has "Publish" where it later has "Share". It
asks first; once you confirm, the draft goes live as its first version and the share dialog
opens with it (nobody has the link yet, and "Only you" under Access keeps it closed). A draft
with issues is not published; the dialog lists what to fix first, with "Let the assistant fix
it".

After that the editor's top bar has "Make changes live" whenever the draft differs from the
version people run. It opens a dialog that says:

| Part | Says |
|---|---|
| What changed | The wizard's own settings, each step by its title (new, removed, or which of its parts: fields, instructions, result …), the steps' order, the files |
| Tested | Whether a test run used exactly this draft: "Tested 4 minutes ago – with these changes" and "See the run", or "Not tested with these changes yet" with "Test now" |
| Notes | Anyone in the middle of a run carries on with the version they started; what a run costs now where that changed; with an account, that the version goes to the cloud too |

"Go live" makes the draft the next version; the link stays the same. Issues stop it, as on the
first publish. The editor's top bar and the wizard's card on the start page say where it runs:

| It says | Means |
|---|---|
| Not published yet · Draft | Only you can run it, as a test. "Publish" puts it live |
| Live · version 3 | The link runs this version. With a cloud icon: on engenty.ai, for everyone with the link |
| Live · 1 note | It runs in the cloud, one step there with less (see "Share") |
| Local | Published on an install without an account: the link answers only on this computer |
| Being sent | The version did not reach engenty.ai yet; the studio tries again by itself |
| Not in the cloud | engenty.ai does not run this version. "Share" says why and what helps |

On a card, "Link" copies the address others can open, and the arrow opens it. A wizard that
runs only on this computer has no address for others: its "Link" says so and how an account
gives it one, and the arrow opens it here.

### Back to draft

"Unpublish" under the gear in the share dialog takes a published wizard back to its draft, after
asking. Its link, QR code, website tag and channels then answer as for a wizard never published,
until you publish it again:

- Anyone in the middle of a run carries on with the version they started; results already shared
  stay.
- The versions stay. Publishing again makes the next one, behind the same link.
- With an account, its copy in the cloud goes back to its draft too and keeps its address there.
  Where the cloud is out of reach, the install asks it again by itself.

## Share

"Share" says who may open the wizard and how others reach it, and copies the link.

| Part | Does |
|---|---|
| Access | "Anyone with the link" can open and fill it in, up to the runs a day set under the gear. "Only you" switches the link off: everyone else sees a notice, you test in the studio |
| How others reach it | The channels the wizard runs as (see below), by kind: in the browser, on the phone, by message. A browser channel has its own link, a message channel its keyword and number; each row copies its own. "Change" picks the channels, with the same list as a new wizard |
| QR code | One of the links as a QR code, to download or print, and the wizard's ID for the mobile app |
| Website | The tag for a website (see below), and for WordPress the plugin or the wizard as a package that runs without an account, with what it lacks there: see [WordPress](./wordpress.md#without-an-account) |
| Copy link | The link people open. It opens the first browser channel, and the wizard offers the others on its first page |
| The gear | Runs a day (50 unless you change it, with what that costs at most), each message channel's keyword, "Create a new link": the old link and its QR code stop working, in the cloud too, and "Unpublish" (see [Back to draft](#back-to-draft)) |

Where the draft has changes, the dialog says so on top and leads to "Make changes live".

One visitor can start 6 runs an hour.

### Channels

A wizard runs page by page, as a chat, as a live conversation on top of the chat, or as a video
call on a stage with the chat beside it (the person talks, the wizard talks back and sees the
camera; both need an OpenAI API key under Models for now); a plugin can add further ways, a
kiosk page or a messenger. A new wizard has the page and the chat switched on; the others are
switched on when the wizard is made, or later under "Change" in the share dialog. Where a channel
cannot take a step, the step goes to the wizard's page: the person gets a link for a photo, a
signature or a sign-in, and comes back after. A step nobody can hand off, for example one that
takes minutes on a channel that cannot wait, shows "Not possible: …" under the channel's name.
A channel that is not set up says "Not set up yet", with "Set up" to its settings.

The home's cards show the channels that are on as small icons, the link's door first. A row of
pills above the cards narrows them to one status (Draft, Local, Live, Not in the cloud) once
two statuses are in play.

The link opens the first browser channel that is on. The others answer under their own address
(`/steps`, `/chat`, `/talk` for live voice, `/video` for the video call) and are offered on the
wizard's first page: "Or: Chat". A switched-off address sends people to the link instead.

### WhatsApp, SMS and calls

On engenty.ai a wizard can also run in a WhatsApp thread, by text message and as a phone call,
where the team's plan includes them. These channels are not part of the open runtime: a local
install has them through its account in the cloud.

Switch one on for a wizard and its row in the share dialog shows the number and the **keyword**:
whoever sends the keyword to the number starts the wizard. "Link" copies a link that writes it,
and the QR code view draws it. The keyword is changed under the gear.

- **WhatsApp**: one field per message, buttons for up to three choices, a list for more, a photo
  or a file sent in the chat, "send location" for a place, a voice message for a text field. A
  free message goes out within 24 hours of the person's last one; a wizard that finishes later
  reaches back with an approved template, or waits for the person's next message.
- **SMS**: text only, choices as numbered lines answered with the number, a place as a typed
  address; long texts come as their gist, every picture, document and the whole result as links.
- **Calls**: the speech model talks, as the chat's live voice does: one field at a time, choices
  read out, e-mail addresses and numbers read back. With several wizards on for calls, the call
  asks which one first.

What a channel cannot take (a signature, a sign-in; by text and on the phone also a photo or a
file) arrives as a link to the wizard's page, and the conversation goes on once it was filled
there. "stop" ends a run in a thread, the keyword starts a new one.

### Who can open the link

An install on your computer only answers on `localhost`: the link works on that computer, not
for anyone else. To let others run the wizard:

| Way | How |
|---|---|
| The cloud | With an [account](./models.md#account) signed in, every version that goes live (the first "Publish", and each "Go live") also goes to engenty.ai. Its link there runs on the account's credits, also while your computer is off |
| Your own server | [Run engenty wizards on a server](./server.md) with a public https address |

### In the cloud

Once an account is signed in under Settings → Account, every version that goes live is sent to
engenty.ai too. The avatar then carries a small cloud, and its menu says "Connected to
engenty.ai" with the credits. The share dialog gives the wizard's address at engenty.ai, which
stays the same when you publish again. Where the cloud does not run this version, the dialog
says so on top:

| It shows | Means |
|---|---|
| "Version 3 does not run in the cloud" | Something the wizard needs is missing there. The list says what; the version before keeps running |
| "Send again" | The last sending did not arrive, or the space changed. When engenty.ai was the trouble, the studio tries again by itself and says when |

Without an account the dialog says that the wizard runs only on this computer ("Only on this
computer" under Access), greys out the ways in and offers to sign in or create an account.
"Website" still gives the WordPress package.

What goes and what stays:

| Goes to the cloud | Stays on your computer |
|---|---|
| The published version and its files | Drafts and the chat with the assistant |
| The space's name, what it says about itself, its colours, facts and logo | Runs and results of your computer |
| The space's own tables and pages | What the wizards keep: their lists and notes |
| How the link is shared: on or off, runs a day, channels | Connected accounts, keys, the space's documents and MCP servers |

At engenty.ai/studio you see the space and its runs there. It is changed on your computer:
the studio there edits nothing. An account holds one space of one computer. On a new computer
the share dialog offers to replace the space of the old one, which removes its wizards and
their links from the cloud.

Deleting a wizard here removes its copy; switching its link off here switches it off there, and
taking it back to its draft does the same there.

### Embed in a website

The share dialog gives a tag to paste into a page's HTML:

| What the website shows | Shows |
|---|---|
| Step-by-step wizard | The wizard page by page |
| Chat | The wizard as a chat, 640 px high (`data-height` changes that) |

| Where on the page | Shows |
|---|---|
| In the page | The wizard in that place of the page, as tall as its content |
| Behind a button | A button in that place that opens the wizard in a window over the page |
| As a chat button | The wizard's engenty in the lower right corner; the chat opens above it |
| As a bubble | Steps only: a round button at the bottom right of the page that opens the wizard in a window over the page, best put in the site's footer |

```html
<script async src="https://example.com/embed.js" data-wizard="TOKEN"></script>
<script async src="https://example.com/embed.js" data-wizard="TOKEN" data-mode="modal" data-label="Start"></script>
<script async src="https://example.com/embed.js" data-wizard="TOKEN" data-runner="chat"></script>
<script async src="https://example.com/embed.js" data-wizard="TOKEN" data-mode="popout"></script>
<script async src="https://example.com/embed.js" data-wizard="TOKEN" data-mode="bubble" data-label="Questions?" data-text="A quote in 2 minutes"></script>
```

A chat in the page that is switched off for the wizard shows the page instead; the chat button
always opens the chat.

| Attribute | Does |
|---|---|
| `data-label` | The button's words; beside the chat button; the bubble's name for screen readers |
| `data-text` | A short line beside the bubble |
| `data-color` | The colour of the chat button and of the bubble |
| `data-height` | The height of a chat in the page, in px |
| `data-page` | The page a run is started on, kept with its result; the page's own address when left out |

Your website's own styles reach the button through the class `engenty-wizard-button`, the chat
button through `engenty-wizard-launcher` and the bubble through `engenty-wizard-bubble`. A page
shows one bubble: a second bubble tag stays silent.

On WordPress the plugin writes this tag for you, and its results show the page: see
[WordPress](./wordpress.md).

## Results people share

On the result page a person can share what they got as a link. The result of a run over the
wizard's link, and the link to it, are deleted after 7 days. The person can withdraw the link
earlier.

## Move a wizard

Export it as a package (`.wizard`) from the editor and import it in another studio, or in the
WordPress plugin. See [Build a wizard](./build-a-wizard.md#take-it-with-you).
