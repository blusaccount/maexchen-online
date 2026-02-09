# Handoff: Modernize games/stocks/js/game.js to ES6

## What Changed

Modernized `games/stocks/js/game.js` from ES5 to ES6 syntax:
- `var` → `const` (preferred) or `let` (when reassigned, including loop variables)
- `function` declarations → arrow functions, except event handlers that use `this` and `updatePreview` (needs hoisting)
- Anonymous callbacks → arrow functions where `this` is not used
- String concatenation → template literals where expressions are interpolated
- Kept IIFE wrapper and all original logic/behavior intact

## How to Verify
1. `npm test` — All 184 tests pass
2. Open stock trading game in browser — market grid, search, trade modal, portfolio, leaderboard, and chart all work identically
