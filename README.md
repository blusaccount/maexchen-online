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

## Run Locally
```
npm install
npm run dev
```
Server runs at `http://localhost:3000`.

## Self-Hosted Quickstart (Docker)
1. Copy env template and fill required values:
   ```bash
   cp .env.example .env
   ```
2. Build and start:
   ```bash
   docker compose up -d --build
   ```
3. Open `http://localhost:3000`.
4. Health check:
   ```bash
   docker compose ps
   curl http://localhost:3000/health
   ```

### Troubleshooting
- **Bot not starting**: ensure `DISCORD_TOKEN` is set in `.env`.
- **Database errors**: verify `DATABASE_URL` format and DB network access.
- **Port already in use**: change host mapping in `docker-compose.yml` (left side of `3000:3000`).

## Configuration (Env)
- `SESSION_SECRET` (required in production)
- `SITE_PASSWORD` (login password, default: ADMIN)
- `CLIENT_ID` and `GUILD_ID` for Discord bot (optional)
- `GAME_ENABLED` (default: `true`)
  - `true`: stock APIs and stock socket events are active.
  - `false`: stock APIs return `503` with `{ code: "GAME_DISABLED" }` and stock socket events emit `stock-error` with `code: "GAME_DISABLED"`.

## In Short
This repository bundles a playable website and multiplayer features with a focus on creative minigames, social interaction, and a stylized retro atmosphere.
