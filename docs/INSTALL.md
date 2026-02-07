# StrictHotel – Quick Install Guide

> **Goal:** Live in under 10 minutes with a single command.

## Prerequisites

| Tool | Version |
|------|---------|
| [Docker](https://docs.docker.com/get-docker/) | ≥ 24 |
| [Docker Compose](https://docs.docker.com/compose/) | ≥ 2 (included in Docker Desktop) |

## 1. Clone & configure

```bash
git clone https://github.com/blusaccount/stricthotel.git
cd stricthotel
cp .env.example .env
```

Open `.env` and change **at least** the session secret:

```dotenv
SESSION_SECRET=replace-with-a-long-random-string
```

Optionally adjust `SITE_PASSWORD` (default: `STRICT`).

## 2. Start

```bash
docker compose up -d
```

This builds the app image, starts PostgreSQL, waits for the database to be ready, and then launches StrictHotel.

## 3. Verify

```bash
# Check that both containers are running and healthy
docker compose ps

# Quick health check
curl http://localhost:3000/health
```

You should see:

```json
{"status":"ok","uptime":5.23,"players":0,"rooms":0,"version":"1.0.0"}
```

Open **http://localhost:3000** in your browser and log in with your `SITE_PASSWORD`.

## Useful commands

```bash
# View live logs
docker compose logs -f app

# Stop everything
docker compose down

# Stop and delete all data (database included)
docker compose down -v

# Rebuild after code changes
docker compose up -d --build
```

## Optional: Discord Bot

Set the Discord variables in `.env`:

```dotenv
DISCORD_TOKEN=your-token
CLIENT_ID=your-client-id
GUILD_ID=your-guild-id
```

Then restart:

```bash
docker compose restart app
```

The app log will show `✓ Discord Bot online als …` when the bot connects successfully, or `⚠ DISCORD_TOKEN nicht gesetzt` if skipped.
