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
| `runs.report(runId, { waitSeconds? })` | The run as it stands: `waitingFor` (a page with the fields shown and what they know, a review, a question), outputs with signed links, cost, `browserUrl`. Waits up to 45 seconds while the run works |
| `runs.answerPage(runId, stepId, values)` | Fills the page the run waits for |
| `runs.review(runId, stepId, action)` | Accepts a review, or asks for one of the shown steps again with a note |
| `runs.answerAsk(runId, askId, "allow" \| "skip")` | Answers a running step's question. A sign-in cannot be answered here: hand off |
| `runs.control(runId, "back" \| "retry" \| "cancel")` | |
| `runs.subscribe(runId, listener)` | Hears every change of the run: its events with their note in both languages, or a status change. Returns the function that stops it |
| `runs.handoffUrl(runId)` | The run page with the run's ticket: the link to send for what the door cannot do. The person who opens it and the door's person are one to the wizard |
| `runs.upload(runId, { data, mime, name })` | A file of the person; the asset id goes into an image or file field with `answerPage` |

A refused command throws an error with `code` (`invalid`, `refused`, `no_credits`) and the
fields that did not fit, which a route passes on as it is.

## What the person sees

- The wizard's first page offers the runners that are on beside "Let's go".
- A hand-off is a link to the same run; nothing is asked twice. The run page knows the
  door's person through the run, and "What this wizard remembers" is theirs there too.
- The space's results carry the door a run came through.

## Not there yet

- A runner's own binding in the share dialog (a number to connect, a keyword): the studio half
  draws it on a page of its own for now.
- An event when a wizard is published, for a runner that prepares something per wizard.
