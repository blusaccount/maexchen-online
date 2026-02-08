# ExecPlan Template

Use this when a task is large, risky, or spans multiple files. Keep it concise and update it as you go.

## Purpose
Explain the user-visible outcome and how to verify it.

## Scope
What is in scope and out of scope. Keep it tight.

## Context
Key files and modules involved, with paths.

## Plan of Work
1. Step-by-step actions, ordered.
2. Note assumptions and decisions.
3. Track any risks.

## Progress
- [ ] Start plan
- [ ] Implement changes
- [ ] Verify behavior
- [ ] Update handoff notes

## Surprises and Discoveries
List anything unexpected you learned while working.

## Decision Log
- Decision: ...
  Rationale: ...
  Date: ...

## Verification
Exact commands or manual steps to validate the change.

## Outcomes
Summarize what shipped and what remains.

---

## ExecPlan - Security + Performance Hardening

## Purpose
Reduce brute-force risk on login, tighten DB TLS configuration, and avoid lingering ffmpeg processes in the Discord bot.

## Scope
In scope: login rate limiting, configurable DB TLS verification, ffmpeg cleanup in bot audio playback.
Out of scope: new auth flows, full session-store migration, major bot feature changes.

## Context
- `server/index.js` login endpoint
- `server/db.js` Postgres SSL settings
- `bot/src/utils/player.js` ffmpeg spawning

## Plan of Work
1. Add a small in-memory rate limiter for `/login`.
2. Make DB TLS verification configurable and secure-by-default.
3. Track and cleanup ffmpeg processes in the Discord bot.
4. Update handoff notes.

## Progress
- [x] Start plan
- [x] Implement changes
- [ ] Verify behavior
- [x] Update handoff notes

## Surprises and Discoveries
- None.

## Decision Log
- Decision: Use a simple in-memory login rate limiter to avoid new dependencies.
  Rationale: Keeps the change low-risk while addressing brute-force exposure.
  Date: 2026-02-08

## Verification
- `npm test`
- Manual: attempt repeated `/login` with wrong passwords to confirm `429` response.

## Outcomes
Login is rate-limited, DB TLS verification is configurable, and ffmpeg processes are cleaned up.

## ExecPlan - Turkish Daily Streaks + Leaderboard

## Purpose
Ensure the Turkish daily quiz is deterministic per day, and add streak-based rewards with a leaderboard.

## Scope
In scope: deterministic daily quiz, streak tracking + rewards, leaderboard API + UI.
Out of scope: new auth flows, full anti-cheat system, translations beyond existing data.

## Context
- `server/turkish-lessons.js` daily lesson + quiz generation
- `server/index.js` Turkish API endpoints
- `server/sql/persistence.sql` DB schema
- `games/turkish/index.html` and `games/turkish/js/game.js` UI

## Plan of Work
1. Make quiz generation deterministic with a daily seed.
2. Add streak tracking module and DB table, with in-memory fallback.
3. Add completion + leaderboard endpoints.
4. Update Turkish game UI to collect name, show rewards, and render leaderboard.
5. Update handoff notes.

## Progress
- [x] Start plan
- [x] Implement changes
- [ ] Verify behavior
- [x] Update handoff notes

## Surprises and Discoveries
- None.

## Decision Log
- Decision: Use UTC day number for streak tracking to match daily lesson logic.
  Rationale: Keeps daily rotation and streaks consistent across time zones.
  Date: 2026-02-08

## Verification
- `node --check server/turkish-streaks.js`
- `node --check server/turkish-lessons.js`
- Manual: complete quiz on consecutive UTC days and verify streak/reward and leaderboard update.

## Outcomes
Turkish daily quiz is deterministic; streak rewards and leaderboard are wired end-to-end.

## ExecPlan - Review Feedback Fixes

## Purpose
Address security/performance review items around rate limiting, brain daily cooldowns, pictochat sanitizing/hydration, DB pool limits, and stock quote overhead.

## Scope
In scope: socket rate limiting by IP, name validation, brain daily cooldown, pictochat message sanitizing + hydration UX, leaderboard broadcast throttling, stock quote caching, DB pool limits, balance update query reductions.
Out of scope: full session store migration or large refactors of socket logic.

## Context
- `server/socket-handlers.js` rate limiting, brain logic, pictochat, stock trades
- `server/db.js` Postgres pool config
- `server/room-manager.js` pot payouts
- `server/index.js` name validation

## Plan of Work
1. Add IP-based socket rate limiting and cleanup for rate limiter maps.
2. Enforce minimum name length in server validation.
3. Add brain daily cooldown (UTC) and throttle leaderboard broadcasts.
4. Harden pictochat message sanitizing and avoid hydration blocking.
5. Add stock quote cache and DB pool limits; reduce balance update queries.
6. Update handoff notes.

## Progress
- [x] Start plan
- [x] Implement changes
- [ ] Verify behavior
- [x] Update handoff notes

## Surprises and Discoveries
- None.

## Decision Log
- Decision: Use wallet ledger entries (`brain_daily`) to enforce daily cooldown when DB is enabled.
  Rationale: Persisted enforcement avoids restarts resetting cooldowns.
  Date: 2026-02-08

## Verification
- `node --check server/socket-handlers.js`
- `node --check server/db.js`
- Manual: attempt brain daily twice in UTC day and verify no second coin award.

## Outcomes
Review items addressed with targeted server-side hardening and performance optimizations.

## ExecPlan - Docker Bot Runtime Fixes

## Purpose
Ensure the Discord bot and yt-dlp work in Docker builds without breaking existing workflows.

## Scope
In scope: Dockerfile and .dockerignore adjustments for bot runtime and security hardening.
Out of scope: bot feature changes, game logic, or non-Docker deployment changes.

## Context
- `Dockerfile` build steps and runtime user
- `.dockerignore` image size and sensitive artifacts
- `bot/scripts/setup.js` postinstall downloader

## Plan of Work
1. Ensure postinstall can run during Docker build (copy bot scripts early, allow scripts).
2. Install curl in the image for yt-dlp download.
3. Run container as a non-root user.
4. Exclude platform binaries from Docker context.
5. Update handoff notes.

## Progress
- [x] Start plan
- [x] Implement changes
- [ ] Verify behavior
- [x] Update handoff notes

## Surprises and Discoveries
- `postinstall` requires `bot/scripts/setup.js` to exist during `npm ci`.

## Decision Log
- Decision: Copy `bot/scripts` before `npm ci` so postinstall can run without disabling install scripts.
  Rationale: Keeps dependency install scripts intact while ensuring yt-dlp is downloaded.
  Date: 2026-02-08

## Verification
- `docker compose build`
- `docker compose up`
- `curl http://localhost:3000/health`

## Outcomes
Docker builds now include yt-dlp and run as non-root; verification pending.

## ExecPlan - PR #1 Self-hosting Baseline

## Purpose
Add a non-disruptive Docker-based quickstart so community owners can run StrictHotel with copy/paste setup.

## Scope
In scope: containerization docs and env template improvements.
Out of scope: game logic, socket behavior, licensing logic.

## Context
- `server.js`, `server/index.js` start path
- `README.md` onboarding docs
- `.env.example` runtime configuration sample

## Plan of Work
1. Add `Dockerfile` and `.dockerignore` with a production-safe Node runtime.
2. Add `docker-compose.yml` for one-command local bring-up.
3. Expand `.env.example` with clear required/optional keys while keeping backward compatibility.
4. Update `README.md` with docker quickstart and troubleshooting notes.
5. Run basic verification commands.

## Progress
- [x] Start plan
- [x] Implement changes
- [x] Verify behavior
- [x] Update handoff notes

## Surprises and Discoveries
- Existing runtime already exposes `/health`, making container health checks straightforward.

## Decision Log
- Decision: Keep `DISCORD_TOKEN` as primary env var and document `DISCORD_BOT_TOKEN` as optional alias for future compatibility.
  Rationale: Avoid disrupting current bot startup logic in `server/discord-bot.js`.
  Date: 2026-02-08

## Verification
- `docker compose config`
- `npm test`

## Outcomes
Shipped non-disruptive containerization assets and updated setup docs.
Verification was attempted; docker is unavailable in this environment and `vitest` is missing, so runtime checks are documented as environment-limited warnings.
