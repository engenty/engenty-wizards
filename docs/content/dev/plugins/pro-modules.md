---
title: Pro modules
description: engenty's closed plugins on a local install – signed packages from the linked account, on while its plan includes them.
---

Some of engenty's plugins are not part of the open product: they come with the Pro and Team
plans. On engenty.ai they are in the cloud runtime's image. A local install gets them from the
linked account, in Settings → Plugins → Pro modules.

## How a module gets there

1. Settings → Account links the install to an engenty account.
2. The runtime asks the account's Manage-App which modules are built for its release and which
   of them the plan includes (`GET /v1/modules`,
   [contract](https://github.com/engenty/engenty-wizards/blob/main/docs/manage-contract.md)).
   The answer holds an entitlement the Manage-App signed: the team, the plan's modules, an end
   about a week ahead.
3. "Install" downloads the module's zip. The runtime takes it only when its SHA-256 matches and
   the signature over id, version, release and that hash checks out against the public key it
   ships with (`apps/runtime/src/plugins/pro-keys.ts`). Nothing is unpacked before that.
4. The module lands in `<DATA_DIR>/pro-modules/<id>/`, apart from the person's own plugins, and
   loads like any other plugin. Its tables are made in the space's database.

## When it is on

A Pro module loads at start and after every check only when all of these hold:

| | Otherwise |
|---|---|
| It was installed for this release | Held back; the next check fetches it again for the new release |
| The entitlement belongs to the account linked now | Held back |
| The entitlement has not ended | Held back until the install is online again |
| The entitlement lists it | Held back: not in the plan |

The runtime checks at start, once a day, when an account is linked and on "Check plan". Offline,
what was confirmed lasts until the entitlement ends. Unlinking the account turns every Pro
module off.

A module that goes off unloads; its files and its tables stay. It comes back with its data when
the plan includes it again. "Remove" deletes its files, not its tables.

## What this protects, and what not

- **Protected:** only a team whose plan includes a module can download it; a package that engenty
  did not sign, or that was changed after signing, never loads – whatever the Manage-App or the
  network in between hand over.
- **Not protected:** the code is on the person's machine. Someone who edits the runtime or its
  data can keep a module on. The terms of use cover that; modules whose value is on the server
  (models, the gateway) stay gated there anyway.

## Settings

| Variable | |
|---|---|
| `ACCOUNT_URL` | The Manage-App the account is linked to; the modules come from there |
| `PRO_MODULES_KEYS` | More public keys (Ed25519, SPKI DER in base64, comma-separated) a package may be signed with – for testing packages signed elsewhere |

A runtime of a Manage-App (`MANAGE_URL`) has no Pro modules: its plugins come with its image and
the Manage-App switches them on per tenant ([Shipping](./shipping)).
