---
title: Runners
description: A door a wizard runs through, beside the page and the chat — a call, a messenger, a kiosk — and the run API that drives runs from it.
---

A runner is a way to run a wizard. The runtime has two: the stepped page at `/w/<token>` and
the chat at `/w/<token>/chat`. A plugin adds more. The owner switches them on per wizard in
the share dialog; the link opens the default, the others answer under their own address or
from their own channel.

## Register a runner

```ts
server.registerRunner({
  id: "kiosk",
  label: { de: "Kiosk", en: "Kiosk" },
  kind: "page",
  capabilities: {
    input: ["text", "select", "multiselect", "toggle", "number", "date"],
    output: { shows: ["text", "image"], pictures: ["dashboard", "widget"] },
    asks: ["confirm"],
    review: ["accept", "regenerate"],
    waits: true,
    handoff: ["screen"],
  },
  page: ({ wizard, path, query }) => new Response(renderKiosk(wizard, path, query)),
});
```

| | |
|---|---|
| `id` | Lower case, digits and `-`, at most 24 characters. The sub-path of the wizard's address |
| `kind` | `page`: the person opens an address. `channel`: the runner has an address of its own (a number, a bot) and drives runs from its webhooks |
| `capabilities` | What the runner takes in and shows; see below |
| `page` | A page runner's handler: what `/w/<token>/<id>` answers with. Nobody is signed in |
| `problem` | `() => string \| null`, may be async: why the runner cannot be used in the current tenant right now ("Not connected: Settings → WhatsApp"), asked inside the tenant whenever the studio lists the runners. With a problem the owner cannot switch it on |

A page runner is served at `/w/<token>/<id>` for every wizard that switched it on. From
source, where Vite serves the pages, the same handler answers at
`/api/public/wizards/<token>/runners/<id>`; the public wizard's `runners` list carries the
right address either way.

### Capabilities

The runner declares; the runtime works out per wizard how far it gets, and the editor shows it:
everything in the channel, hands off to the page at these steps, or not possible.

| Field | Says |
|---|---|
| `input` | The field kinds the runner asks itself. Any other field hands off to the run page |
| `output.shows` | What it shows as it is: `text`, `data`, `image`, `video`, `voice`, `document`, `dashboard`, `widget`, `film`, `surface` |
| `output.pictures` | What it shows as a picture with a link to the real thing. Anything else is a link |
| `asks` | `confirm` for a running step that asks before it changes something; `login` only where a browser types the sign-in |
| `review` | `accept`, `regenerate`, `edit` |
| `waits` | Whether it stays through a step that takes minutes. A runner that cannot gets "not possible" for such wizards |
| `handoff` | How a link to the run page reaches the person: `screen`, `thread`, `sms`, `push`. A runner with none cannot hand off |

## Drive a run

`server.runs` holds the functions behind the MCP tools, for the plugin's own door. A run
started here is a live run of the published wizard for a person of that door.

```ts
server.registerPublicRoute({
  method: "POST",
  path: "/call/:token",
  handler: async ({ params, json }) => {
    const { from, said } = await json<{ from: string; said: string }>();
    const { runId, ticket, refused } = await server.runs.start({
      token: params.token,
      person: { channel: "phone", id: from },
      answers: { name: said },
    });
    const report = await server.runs.report(runId, { waitSeconds: 20 });
    if (report.waitingFor && "page" in report.waitingFor) {
      // Ask the next field; fields with inChat=false need the run page.
      const link = await server.runs.handoffUrl(runId);
    }
    return { runId, ticket, refused, report };
  },
});
```

| Call | |
|---|---|
| `runs.start({ token \| wizardId, person, answers?, runner? })` | Starts a live run. `person` names who it is for on the door; the runtime keeps a hash of it as the run's visitor, so what the wizard remembers is theirs on the run page too. `answers` fills the first page; what did not fit comes back as `refused`. Gives the run's ticket |
| `runs.report(runId, { waitSeconds?, draft? })` | The run as it stands: `lang`, `waitingFor` (a page with the fields shown and what they know, a review, a question), outputs with signed links and a `picture` (a PNG of a document, a dashboard or a widget), cost, `browserUrl`. Waits up to 45 seconds while the run works. A door that asks a page one field at a time passes what it has as `draft`: a field's `shown` then follows those answers, as the form on the screen does |
| `runs.wizards(runner)` | The published wizards of the tenant that switched the runner on: what the door offers, with `token`, `title` and `lang` |
| `runs.answerPage(runId, stepId, values)` | Fills the page the run waits for |
| `runs.review(runId, stepId, action)` | Accepts a review, or asks for one of the shown steps again with a note |
| `runs.answerAsk(runId, askId, "allow" \| "skip")` | Answers a running step's question. A sign-in cannot be answered here: hand off |
| `runs.control(runId, "back" \| "retry" \| "cancel")` | |
| `runs.subscribe(runId, listener)` | Hears every change of the run: its events with their note in both languages, or a status change. Returns the function that stops it |
| `runs.handoffUrl(runId)` | The run page with the run's ticket: the link to send for what the door cannot do. The person who opens it and the door's person are one to the wizard |
| `runs.upload(runId, { data, mime, name })` | A file of the person; the asset id goes into an image or file field with `answerPage` |
| `runs.transcribe(runId, { data, mime })` | What is said in a recording of the person (a voice message), written down with the tenant's listener and charged to the run |

A refused command throws an error with `code` (`invalid`, `refused`, `no_credits`) and the
fields that did not fit, which a route passes on as it is.

## What the person sees

- The wizard's first page offers the runners that are on beside "Let's go".
- A hand-off is a link to the same run; nothing is asked twice. The run page knows the
  door's person through the run, and "What this wizard remembers" is theirs there too.
- The space's results carry the door a run came through.

## The runner's part of the share dialog

A channel has something to show per wizard: the keyword that starts it, the number, a link with
its QR code. The studio half registers it, and the share dialog draws it under the runner's row
once the owner switched the runner on:

```tsx
studio.registerShareSection({ runner: "whatsapp", component: ShareSection });

function ShareSection({ wizard }: StudioShareSectionProps) {
  // wizard: { id, title }; the plugin's own routes hold the rest.
}
```

One section per runner. The settings a channel needs once per tenant (the number, the token)
go into a [settings section](./studio.md).

## A thread door from the SDK

A messenger runs a wizard one message at a time: a field per question, options to tap or to
number, a link to the screen for what the thread cannot take, the result as pictures and links.
That conversation is the same on every messenger; the SDK holds it, and a plugin brings the
surface: how a question is drawn there, how a file is fetched.

```ts
import { ThreadDoor, type ThreadSurface } from "@engenty-wizards/plugin-sdk/thread";

const surface: ThreadSurface = {
  runner: "sms",
  asks: ["text", "number", "select", "multiselect", "toggle", "date", "email", "url", "location"],
  async send(thread, prompt) {
    // prompt.kind: "text" | "choice" | "location" | "link" | "media" — draw it as the channel allows.
    await twilio.send(thread.id, toText(prompt, thread.state.lang));
  },
};

const door = new ThreadDoor({ runs: server.runs, surface, offered, watch, unwatch, log });
// A webhook: door.inbound(thread, message). A run that changed: door.resume(thread).
```

| | |
|---|---|
| `ThreadSurface.asks` | The field kinds the thread asks itself; a page with any other field goes to the screen as a link |
| `send(thread, prompt)` | A `choice` is drawn as buttons, a list or numbered lines; a typed number or title counts as a tap, the door works that out. `link` and `media` carry a URL |
| `media(ref)` | A file the person sent, by what the webhook named; without it files hand off |
| `mayDeliver`, `reach` | A messenger with a window (WhatsApp's 24 hours): whether a free message may go out now, and the link by other means when not |
| `offered()` | The wizards switched on for the runner (`runs.wizards`) with their keywords; a keyword in the thread starts its wizard, else the door offers the menu |
| `watch(thread)`, `unwatch(runId)` | Hear the run (`runs.subscribe`) and call `door.resume` when it moves; the plugin keeps the subscriptions |
| `Thread` | `{ id, name, runId, state, lastInboundAt, lastMessageId }`: the plugin keeps it in a table per person and hands it to the door before and after |

The WhatsApp module in `modules/whatsapp` and the SMS module in `modules/sms` are two surfaces
of this door: the webhook on a public route, the keyword table, the number in the settings and
the keyword in the share dialog are theirs; buttons and lists, the location request and files
through the Cloud API are WhatsApp's surface, numbered lines and links are SMS's.

## Not there yet

- An event when a wizard is published, for a runner that prepares something per wizard.
