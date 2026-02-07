# Copilot Instructions for StrictHotel

## Project overview

StrictHotel is a multiplayer minigame collection powered by Node.js, Express, and Socket.IO with a vanilla JavaScript frontend. Games include Mäxchen (dice bluffing), Watchparty, StrictBrain, a Turkish quiz, and a stock trading simulator. Data is persisted in PostgreSQL (Neon).

## Tech stack

- **Runtime:** Node.js (ES modules — `"type": "module"` in package.json)
- **Backend:** Express + Socket.IO
- **Frontend:** Vanilla JavaScript, HTML, CSS (no bundler)
- **Database:** PostgreSQL via the `pg` package
- **Testing:** Vitest

## Build, test, and run commands

- `npm start` — start the production server
- `npm run dev` — start with `--watch` for auto-reload
- `npm test` — run all tests once (Vitest)
- `npm run test:watch` — run tests in watch mode

There is no build step; the project serves vanilla JS directly.

## Code style and conventions

- Use ES module syntax (`import`/`export`), never CommonJS.
- Use `camelCase` for variables and functions.
- Use `kebab-case` for Socket.IO event names (e.g., `place-bet`, `start-game`).
- Keep content ASCII unless the file already contains Unicode.
- Follow the formatting and naming patterns already present in the file you are editing.
- Prefer the smallest viable change; avoid refactoring unrelated code.

## Architecture guidelines

- Socket events are the source of truth for multiplayer state.
- In-memory room state lives in `server/room-manager.js`.
- DB operations use `async`/`await` with a local fallback when `DATABASE_URL` is unset.
- Shared client modules are in `shared/js/`; shared styles in `shared/css/theme.css`.
- Game-specific code is in `games/<game-name>/`.
- Server-side logic is in `server/`.

## Testing

- Unit tests live in `server/__tests__/` and use Vitest.
- Test server-side logic (game rules, currency, room state).
- Do not add tests for pure UI or socket transport unless specifically requested.

## Safety and reliability

- Always validate untrusted inputs on the server side.
- Avoid silent failures; log errors consistently with existing patterns.
- Keep Socket.IO rate limits in mind.
- Never commit secrets or `.env` files.

## Workflow

- Read `HANDOFF.md` before starting work to understand recent changes and open risks.
- Record what you changed, why, and how to verify it in `HANDOFF.md` when done.
- For large or risky changes, create an execution plan in `PLANS.md`.
