---
title: Connectors
description: Services a wizard works in for the person who runs it — built in, from the registry, or over MCP.
version: 0.3.2
---

Settings → Connectors lists the services the space's wizards can work in. A connector is used
with the account of the person who runs the wizard: they connect it during a run, on a page that
asks for it. Each space has its own connectors; in a team on engenty.ai, the owner and the admins
add and remove them.

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
The OAuth services need a client of your own, entered in the install's settings file. Google is
the exception on a local install: without a Google client of its own, Gmail, Drive, Calendar and
Contacts connect through your engenty account, which holds the client. Connecting then asks you
to sign in to the account first (Settings → Account).

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
   once an account is connected; "Reload actions" asks the service again.

A service that needs an OAuth client of your own says so: remove it and import it again with
"Your own OAuth client".

The editor's chat does the same while it builds a wizard: ask it to work with a service, and it
finds and imports the connector. So does an [AI app](./ai-apps.md) connected to engenty wizards.

## What a wizard may do

A wizard names the actions it uses; without a list it uses only those that read. During a run:

| The action | Happens |
|---|---|
| Reads | Runs without asking, unless the wizard says to ask |
| Changes something | The person confirms each call, or allows it for the rest of the run. A wizard can let it run without asking |
| Deletes | The person confirms it like a change. A wizard can never let it run without asking |

## The person's mailbox

A wizard can ask for the person's mailbox and read it: search mails, read them, keep
attachments. It never writes. The person picks how to connect:

| Way | Needs from the install |
|---|---|
| Any mailbox over IMAP | Nothing |
| "Gmail" button | The Google client, with the Gmail API enabled and the scope `gmail.readonly`; on a local install without one, your engenty account |
| "Outlook" button | The Microsoft client, with the delegated permission `Mail.Read` |

## Connected systems

The section also holds "Connected systems": MCP servers of your own, each with a name,
its MCP address and, if the server wants one, an authorization header. AI steps read from and write to
these systems only where you allow the server on the step.

This is the other direction of [AI apps](./ai-apps.md): here engenty calls other servers, there
your AI app calls engenty.
