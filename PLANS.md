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
