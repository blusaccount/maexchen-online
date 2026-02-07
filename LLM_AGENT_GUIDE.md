# LLM Agent Guide (StrictHotel)

This guide helps LLM agents work effectively in this repo. Keep it short, stay in scope, and follow local patterns.

## Quick repo map
- Server runtime: [server.js](server.js)
- Realtime events + validation: [server/socket-handlers.js](server/socket-handlers.js)
- Room state + helpers: [server/room-manager.js](server/room-manager.js)
- Shared client modules: [shared/js](shared/js)
- Shared styles: [shared/css/theme.css](shared/css/theme.css)
- Public pages: [public](public)
- Game frontends: [games](games)

## Core flows (mental model)
- Login/session gate in [server.js](server.js) protects most routes.
- Lobby -> room creation/join flows originate in [shared/js/lobby.js](shared/js/lobby.js).
- Socket events are the source of truth for multiplayer behavior.
- In-memory state lives in [server/room-manager.js](server/room-manager.js).

## Do this every task
- Read [HANDOFF.md](HANDOFF.md) first to capture recent changes and open risks.
- Prefer existing helpers and patterns before adding new ones.
- Keep changes minimal, additive, and reversible.
- Validate behavior manually if you touch sockets, auth, or game logic.

## Tooling expectations
- Use repo tools instead of terminal commands when possible.
- Batch file reads and searches.
- Avoid destructive git commands.

## Best-practice prompts (agents)
- Be explicit about scope and output shape.
- Ask for clarification only when blocked by missing requirements.
- Use tests or manual verification steps when behavior changes.
- For long or risky work, create a lightweight execution plan and keep it updated.

## When to create a plan
Create a plan if any of these are true:
- Multi-file changes with side effects in sockets or auth
- Behavior changes across client + server
- Data migrations or new persistent state

## Handoff discipline
- Record what changed, why, and how to verify in [HANDOFF.md](HANDOFF.md).
- Note any assumptions or risks.
- Add follow-ups only when genuinely needed.

## Safety and reliability
- Validate untrusted inputs on the server.
- Avoid silent failures; log errors consistent with existing patterns.
- Keep rate limits in mind for socket events.

## Local conventions
- Keep content ASCII unless the file already uses Unicode.
- Follow existing formatting and naming patterns in the touched file.
- Prefer the smallest viable change.
