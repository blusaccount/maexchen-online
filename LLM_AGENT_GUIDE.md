# LLM Agent Guide (StrictHotel)

This guide helps LLM agents work effectively in this repo. Keep it short, stay in scope, and follow local patterns.

## Quick repo map
- Server runtime: [server.js](server.js)
- Realtime events + validation: [server/socket-handlers.js](server/socket-handlers.js)
- Room state + helpers: [server/room-manager.js](server/room-manager.js)
- Route modules: [server/routes/](server/routes/) (auth, stocks, turkish, nostalgiabait)
- Shared client modules: [shared/js](shared/js)
- Shared styles: [shared/css/theme.css](shared/css/theme.css)
- Public pages: [public](public)
- Game frontends: [games](games)

## Core flows (mental model)
- Login/session gate in [server/routes/auth.js](server/routes/auth.js) protects most routes.
- Lobby -> room creation/join flows originate in [shared/js/lobby.js](shared/js/lobby.js).
- Socket events are the source of truth for multiplayer behavior.
- In-memory state lives in [server/room-manager.js](server/room-manager.js).

## Do this every task
- Read [HANDOFF.md](HANDOFF.md) first to capture recent changes and open risks.
- Prefer existing helpers and patterns before adding new ones.
- Keep changes minimal, additive, and reversible.
- Validate behavior manually if you touch sockets, auth, or game logic.

## ExecPlans
When a task is large, risky, or spans multiple files, create an ExecPlan using [PLANS.md](PLANS.md). Keep it short and update it as you work.

## Scope discipline
- Implement exactly what the user asks.
- Avoid adding adjacent features without confirmation.
- Prefer existing patterns and helpers.

## Handoff
Record changes and verification notes in [HANDOFF.md](HANDOFF.md).

## Safety and reliability
- Validate untrusted inputs on the server.
- Avoid silent failures; log errors consistent with existing patterns.
- Keep rate limits in mind for socket events.

## Local conventions
- Keep content ASCII unless the file already uses Unicode.
- Follow existing formatting and naming patterns in the touched file.
- Prefer the smallest viable change.
