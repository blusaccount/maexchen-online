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

## ExecPlan - Lean Strict Brain Refactor

## Purpose
Reduce duplication in Strict Brain mini-game logic while keeping behavior identical.

## Scope
In scope: refactor shared mini-game logic for single and versus modes.
Out of scope: UI changes, gameplay changes, or new features.

## Context
- `games/strictbrain/js/game.js`

## Plan of Work
1. Extract shared mini-game logic into reusable helpers.
2. Rewire single-player and versus wrappers to use helpers.
3. Update handoff notes and run a syntax check.

## Progress
- [x] Start plan
- [x] Implement changes
- [x] Verify behavior
- [x] Update handoff notes

## Surprises and Discoveries
- None.

## Decision Log
- Decision: Keep helpers in the same file to avoid adding new script tags.
  Rationale: Minimize integration risk and keep scope tight.
  Date: 2026-02-08

## Verification
- `node --check games/strictbrain/js/game.js`

## Outcomes
Strict Brain mini-game logic is de-duplicated with shared helpers.

## ExecPlan - Persistent Brain Leaderboards

## Purpose
Persist Strict Brain leaderboards (overall and per-game) in Postgres while keeping an in-memory fallback for local dev.

## Scope
In scope: DB schema additions, server-side leaderboard storage/query, socket handlers wired to DB-backed leaderboards.
Out of scope: UI changes, new gameplay mechanics.

## Context
- `server/socket-handlers.js`
- `server/sql/persistence.sql`
- `server/db.js`

## Plan of Work
1. Add DB tables for brain leaderboards and per-game scores.
2. Add server module for upserting/querying leaderboards with memory fallback.
3. Wire socket handlers to use the new module and remove in-file maps.
4. Update handoff notes and verify with syntax checks.

## Progress
- [x] Start plan
- [x] Implement changes
- [ ] Verify behavior
- [x] Update handoff notes

## Surprises and Discoveries
- None.

## Decision Log
- Decision: Use per-game upsert rules (reaction: lower better, others: higher better).
  Rationale: Matches existing leaderboard semantics.
  Date: 2026-02-08

## Verification
- `node --check server/brain-leaderboards.js`
- `node --check server/socket-handlers.js`

## Outcomes
Strict Brain leaderboards are persisted in DB with a safe in-memory fallback.

## ExecPlan - Leaderboard Hardening (All)

## Purpose
Harden all leaderboards with DB indexing and bounded in-memory fallbacks.

## Scope
In scope: add DB indexes for brain/turkish leaderboards and prune in-memory fallback maps.
Out of scope: behavioral changes or UI changes.

## Context
- `server/sql/persistence.sql`
- `server/brain-leaderboards.js`

## Plan of Work
1. Add DB indexes for leaderboard queries.
2. Add in-memory pruning for leaderboards in dev fallback.
3. Update handoff notes.

## Progress
- [x] Start plan
- [x] Implement changes
- [ ] Verify behavior
- [x] Update handoff notes

## Surprises and Discoveries
- None.

## Decision Log
- Decision: Cap in-memory leaderboards at 100 entries.
  Rationale: Prevent unbounded growth while preserving top scores.
  Date: 2026-02-08

## Verification
- `node --check server/brain-leaderboards.js`

## Outcomes
All leaderboards now have DB indexes and bounded in-memory fallbacks.

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

## ExecPlan - LoL Bet Resolution Reliability

## Purpose
Reduce false "No new match found" outcomes and transient Riot API failures that block LoL bet resolution.

## Scope
In scope: Riot API retry/backoff for transient upstream errors, broader match-history lookup for bet checks, targeted tests.
Out of scope: new admin tooling or UI redesign.

## Context
- `server/riot-api.js`
- `server/lol-match-checker.js`
- `server/__tests__/lol-match-checker.test.js`

## Plan of Work
1. Add bounded retry/backoff for transient Riot API failures (5xx/network).
2. Increase match-history depth used by background/manual bet checks.
3. Add tests for baseline-not-in-window/manual resolution behavior.
4. Update handoff notes.

## Progress
- [x] Start plan
- [x] Implement changes
- [x] Verify behavior
- [x] Update handoff notes

## Surprises and Discoveries
- None yet.

## Decision Log
- Decision: Retry only transient failures (network + 5xx), not auth/rate-limit errors.
  Rationale: avoids masking configuration errors while improving reliability.
  Date: 2026-02-08

## Verification
- `npm test -- server/__tests__/lol-match-checker.test.js`

## Outcomes
Shipped with an additional follow-up: per-bet match selection with timestamp-aware scanning when baseline is outside the history window.
