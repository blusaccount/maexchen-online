# Handoff: Modernize public/lobby.js to ES6

## What Changed

Modernized `public/lobby.js` from ES5 to ES6 syntax:
- `var` → `const` (or `let` for `registered` which is reassigned)
- `function` declarations → arrow functions (all standalone and callback functions)
- String concatenation → template literals (coin styles, toast text)
- Kept IIFE wrapper and all original logic/behavior intact

## Previous Change

Extracted routes from `server/index.js` (514 → 148 lines) into separate modules:

- `server/routes/auth.js` — Login route, auth middleware, sanitizePlayerName, rate limiter
- `server/routes/stocks.js` — `/api/ticker`, `/api/stock-search`, `/api/stock-quote` with caches
- `server/routes/turkish.js` — `/api/turkish/daily`, `/api/turkish/complete`, `/api/turkish/leaderboard`
- `server/routes/nostalgiabait.js` — `/api/nostalgia-config`
- `server/cleanup.js` — Periodic cleanup interval (orphaned players/rooms/rate limiters)

## What Didn't Change
- Pure structural refactor — no behavior changes
- All routes work identically
- All 184 tests pass

## How to Verify
1. `npm test` — All 184 tests pass
2. Open lobby in browser — all functionality (avatar, name input, rain effect) works identically
