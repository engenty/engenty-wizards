---
title: Connectors
description: Services a wizard works in for the person who runs it — built in, from the registry, or over MCP.
---

Settings → Connectors lists the services your wizards can work in. A connector is used with the
account of the person who runs the wizard: they connect it during a run, on a page that asks
for it.

## Built in

| Service | The person signs in with |
|---|---|
| Gmail, Google Drive, Google Calendar, Google Contacts | Google (OAuth) |
| Outlook, OneDrive | Microsoft (OAuth) |
| Slack | Slack (OAuth) |
| GitHub | GitHub (OAuth) |
| HubSpot | A token they enter |
| S3 | Keys they enter |

A connector marked "not set up" needs something from the install first: the page says what.
The OAuth services need a client of your own, entered in the install's settings file:

| Service | Settings |
|---|---|
| Google | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` |
| Microsoft | `MICROSOFT_OAUTH_CLIENT_ID`, `MICROSOFT_OAUTH_CLIENT_SECRET` |
| Slack | `SLACK_OAUTH_CLIENT_ID`, `SLACK_OAUTH_CLIENT_SECRET` |
| GitHub | `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` |

- Give each client the redirect address `<your address>/api/connect/callback`.
- For Google, enable the APIs you use and add their scopes to the consent screen.
- A connection asks only for what the wizard's actions need.

Where the settings file is: [Command line](./command-line.md#settings).

## From the registry

Any other service comes from the [integrations.sh](https://integrations.sh) registry:

1. Search the service, for example Notion or Stripe.
2. "Import" takes it in, from its API description or its MCP server.
3. Its actions appear, marked as "reads", "changes" or "deletes". Some services list them only
   once an account is connected.

A service that needs an OAuth client of your own says so: remove it and import it again with
"Own OAuth client".

The assistant can do the same from the conversation: ask it to work with a service, and it
finds and imports the connector.

## What a wizard may do

A wizard names the actions it uses. During a run:

| The action | Happens |
|---|---|
| Reads | Runs without asking |
| Changes something | The person confirms each call, or allows it for the rest of the run |
| Deletes | Always asks |

## The person's mailbox

A wizard can ask for the person's mailbox and read it: search mails, read them, keep
attachments. It never writes. The person picks how to connect:

| Way | Needs from the install |
|---|---|
| Any mailbox over IMAP | Nothing |
| "Gmail" button | The Google client, with the Gmail API enabled and the scope `gmail.readonly` |
| "Outlook" button | The Microsoft client, with the delegated permission `Mail.Read` |

## Connected systems (MCP)

The section also holds "Connected systems (MCP)": MCP servers of your own, each with a name,
its MCP address and, if the server wants one, an authorization header. AI steps read from and write to
these systems only where you allow the server on the step.

This is the other direction of [AI apps](./ai-apps.md): here engenty calls other servers, there
your AI app calls engenty.
