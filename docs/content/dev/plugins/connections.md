---
title: Accounts
description: Accounts a plugin connects for a space — a calendar, a mailbox — through the runtime's built-in connectors.
---

A wizard's connections belong to the person who runs it. A plugin that works for the whole
space, a calendar that every booking wizard reads, connects an account of its own:
`server.connections`. It uses the runtime's built-in OAuth connectors (Google, Microsoft, Slack,
GitHub, HubSpot …), keeps the tokens sealed in the tenant's database, and refreshes them.

```ts
const ACTIONS = ["list_events", "create_event", "delete_event"];

// Which of them can be signed in to on this runtime now.
const offered = await server.connections.available(["google-calendar", "microsoft-outlook"]);

// The provider's sign-in page, for a route of the plugin to hand to its studio half.
const { url } = await server.connections.start({ space, connector: "google-calendar", actions: ACTIONS });

// Later, in a route, a tool or a job:
const [account] = await server.connections.list(space);
const { events } = await server.connections.call(account.id, "list_events", {
  time_min: from,
  time_max: to,
});
```

| `server.connections.` | Does |
|---|---|
| `available(ids)` | Of these connector ids, the ones a person can connect here now, with their names. An OAuth connector is offered once its client is set up (`GOOGLE_OAUTH_CLIENT_ID` …), and on a local install Google also through the linked account |
| `start({ space, connector, actions })` | The provider's sign-in page. Only the rights `actions` need are asked for |
| `list(space)`, `get(id)` | What is connected: `{ id, space, connector, label, actions, createdAt }`, the newest first. `label` is the account as the provider names it |
| `call(id, action, input)` | Runs one of the connector's actions with the account. A fresh token is fetched first when the old one runs out |
| `remove(id)` | Forgets the connection and its tokens |

## Signing in

`start` gives an address; open it in a window from the studio half. The provider sends the
person back to the runtime (`/api/connect/callback`, the address a wizard's connections use), the
runtime keeps the account under the plugin and the space, and the window posts a message to the
studio and closes:

```tsx
const { url } = await studio.api.post<{ url: string }>(`/connect?space=${space.id}`);
window.open(url, "connect", "width=520,height=700");

window.addEventListener("message", (event) => {
  if (event.data?.type === "wizards:connected") {
    refetch();
  }
});
```

- A second sign-in to the same account for the same space replaces the first one's tokens and
  actions; it does not add a second connection.
- A local install without a Google client of its own connects Google through the Manage-App of
  the linked account. Without a linked account `start` throws an error with the status `409` and
  the code `account`, whose message says what to do.

## What `call` refuses

- An action the connection was not made for: connect again with that action in `actions`.
- What the provider refuses: its error, with the status and the first words of its answer. A
  connection the person removed at the provider answers so on the next call.

## Where it is kept

The table `plugin_connection` of the tenant's database, by plugin and space. A plugin sees only
its own connections. Deleting a space deletes them. Unloading or removing the plugin leaves them.
