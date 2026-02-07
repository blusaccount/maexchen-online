# StrictHotel

StrictHotel is an experimental minigame collection in a **neal.fun-inspired** style: fast, visual web experiences with multiplayer chaos and nostalgic flair.

## Highlights
- Multiplayer lobby and rooms via Socket.IO
- Maexchen (dice bluff) and Watchparty
- Pictochat-style doodle board in the lobby
- Lobby soundboard
- Nostalgiabait (retro boot experiences) under /nostalgiabait
- Login protection via session + password

## Repo Structure
- **Server**: `server.js` starts [server/index.js](server/index.js) (Express + Socket.IO)
- **Public UI**: [public](public) (Landing, Login, Nostalgiabait, Lobby features)
- **Games**: [games](games) (e.g. Maexchen, Watchparty)
- **Shared**: [shared](shared) (Chat, Lobby, Avatars, Creator, CSS, Audio)
- **Bot**: [bot](bot) (Discord bot + commands)

## LLM Agent Notes
When LLM agents work in this repo, use these files:
- [AGENTS.md](AGENTS.md): entry point and rules
- [LLM_AGENT_GUIDE.md](LLM_AGENT_GUIDE.md): repo mental model, do/don'ts
- [EVENTS.md](EVENTS.md): socket event overview
- [PLANS.md](PLANS.md): ExecPlan template for larger tasks
- [HANDOFF.md](HANDOFF.md): short log of changes and risks

## Quick Start (Docker)
```bash
git clone https://github.com/blusaccount/stricthotel.git
cd stricthotel
cp .env.example .env      # edit SESSION_SECRET at minimum
docker compose up -d
```
Open **http://localhost:3000** – done.

See [docs/INSTALL.md](docs/INSTALL.md) for the full guide.

## Run Locally (without Docker)
```
npm install
npm run dev
```
Server runs at `http://localhost:3000`.

## Configuration (Env)
- `SESSION_SECRET` (required in production)
- `SITE_PASSWORD` (login password, default: ADMIN)
- `CLIENT_ID` and `GUILD_ID` for Discord bot (optional)

## In Short
This repository bundles a playable website and multiplayer features with a focus on creative minigames, social interaction, and a stylized retro atmosphere.
