---
title: Run it on a server
description: One Docker container behind an https proxy, so others can open your wizards' links.
version: 0.2.50
---

An install on your computer answers on `localhost` only. On a server with a public address,
anyone with a link can run your wizards.

## Start it

You need Docker and an https proxy in front, such as Caddy or Traefik.

```bash
git clone https://github.com/engenty/engenty-wizards.git
cd engenty-wizards
cp .env.example .env
```

In `.env`, set `APP_URL` to your https address (the container does not start without it) and add
a model key. Then:

```bash
docker compose up -d --build
docker compose logs
```

The logs show a link. Open it once: it signs your browser in.

## What to know

| | |
|---|---|
| Port | Point the proxy at port 8891 |
| Data | On the `/data` volume: databases and files. Back that volume up |
| Models | Your keys or Ollama. The subscriptions of AI clients live on your own computer, not on a server |
| PDF, PNG, browser steps, MP4 | Chromium and ffmpeg are in the image |
| Code & shell | The sandbox is off in this image; steps cannot use that tool. `compose.yaml` shows how to switch it on |
| Plugins | A folder named in `PLUGINS_DIR`, mounted into the container |

## Update

```bash
git pull
docker compose up -d --build
```

The data is brought up to date at the start.

## Sign in again

The link works once. For a new one, restart the container and read the logs again.
