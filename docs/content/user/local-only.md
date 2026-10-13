---
title: Local only
description: An install without an account. Nothing leaves the computer; links answer on it only. The flag, what it means, and how to connect an account later.
version: 0.3.4
---

An install normally signs in to your account during the setup: your team's space comes down to
the computer, and what you publish runs in the cloud too. An install can also stay alone.

## The flag

```bash
curl -fsSL https://engenty.ai/install.sh | bash -s -- --local
```

`--local` skips the account step of the setup and switches the account off for this install.
On an install that is there already: `wizards setup --local`.

## What it means

- No account, nothing leaves this computer. Wizards, the space and results stay in
  `~/.engenty/wizards/data` ([Your data](./data.md)).
- Links answer on this computer only: `http://localhost:24368/w/…`. For others to open them,
  run it [on a server](./server.md) of your own.
- It thinks with your AI clients, your own keys, Ollama or Apple Intelligence
  ([First start](./first-start.md)). Without an account, video and voice need a key of your own.
- The studio shows no account surfaces: no sign-in offer, no credits, no cloud copy. The feature
  switch `account` is off in the install's `.features` file; `wizards features` lists it.

## Connect an account later

```bash
wizards account sign-in
```

The command shows a code and opens the browser for the sign-in; afterwards the install is
connected, and the switch is on again. `wizards account` says how the install stands,
`wizards account sign-out` disconnects it. Settings → Account in the studio does the same.
