# HANDOFF - Compact Main Menu Layout

## What Was Done

### UI Change: Compact Game Cards in Main Menu

**Game card layout** (`public/index.html`)
- Changed game cards from vertical (stacked) to horizontal (icon left, text right)
- Wrapped text content in `.game-card-info` div for flex layout
- Reduced card padding (30px → 12px), icon size (4rem → 2rem), font sizes
- Grid now uses fixed 2-column layout instead of auto-fit with 280px minimum
- Description text clamped to 2 lines with overflow hidden
- Updated mobile breakpoints to match compact sizing
- Border reduced from 2px to 1px; hover effects scaled down proportionally

## Files Changed
- `public/index.html` — CSS and HTML for compact game card layout

## Verification
- Server starts, page renders correctly
- Game cards display in compact 2-column grid with horizontal layout
- All game links still work
- Mobile responsive breakpoints preserved
- CodeQL: 0 alerts

---

# HANDOFF - Mäxchen Betting Feature

## What Was Done

### New Feature: Mäxchen Betting

**Betting UI in waiting room** (`games/maexchen/index.html`)
- Added betting section with coin input, "Setzen" button, balance display, and bet list
- Shows all placed bets in real-time

**Server-side betting logic** (`server/socket-handlers.js`)
- New `place-bet` socket event with validation (balance check, integer check, range 0-1000, rate limiting)
- Imported `addBalance` and `deductBalance` from currency.js
- On `start-game`: deducts bets from all players, builds pot, stores in game state
- On `game-over` (challenge path): awards pot to winner, sends balance updates
- On `game-over` (believe-maexchen path): same pot distribution
- Broadcasts `bets-update` to room when any player places a bet

**Pot distribution on disconnect** (`server/room-manager.js`)
- Imported `addBalance` and `getBalance` from currency.js
- On disconnect game-over: awards pot to winner, sends balance updates

**Client-side game logic** (`games/maexchen/js/game.js`)
- Handles `balance-update` to track player balance
- Handles `bets-update` to render bet list in waiting room
- Emits `place-bet` on button click with client-side validation
- Shows pot display during active game
- Shows winnings amount on game-over screen
- Requests balance on load via `get-balance`

**Styling** (`shared/css/theme.css`)
- `.bet-section` — gold-bordered container for betting UI
- `.bet-row` — flex row with input, label, button
- `.bet-entry` — individual bet display in list
- `.pot-display` — in-game pot indicator
- `.pot-winnings` — animated gold text for winner's earnings

## Files Changed
- `server/socket-handlers.js` — place-bet handler, pot in game state, pot distribution on game-over
- `server/room-manager.js` — currency imports, pot distribution on disconnect game-over
- `games/maexchen/index.html` — betting section in waiting room, pot display in game/gameover screens
- `games/maexchen/js/game.js` — betting client logic, pot display, winnings display
- `shared/css/theme.css` — betting and pot styles

## Not Changed
- `server/currency.js` — already had all needed functions
- `server/game-logic.js` — no changes needed
- Discord bot, other games, shared JS modules

## Verification
- Server starts without errors, all modules import correctly
- Betting UI renders in waiting room with balance display
- Placing a bet updates the bet list in real-time
- CodeQL: 0 alerts

## Open Items
- Balances are in-memory only (no persistence across server restarts)
- CSS could be split into modules (theme.css is now ~2300 lines)

---

# HANDOFF - Persistence Direction (Wallet + Leaderboards)

## What Was Done

- Added `docs/persistence-plan.md` with a fresh-start persistence strategy tailored for Render free tier.
- Documented a recommended Postgres schema for:
  - `players` (wallet balance)
  - `stock_positions` (portfolio holdings)
  - `wallet_ledger` (auditable balance changes)
- Added a rollout checklist and post-deploy verification steps.

## Why

- Current wallet and stock leaderboard data are in-memory and are lost on process restart.
- Since there are no users yet, a clean cutover can be done without migration complexity.

## Files Changed

- `docs/persistence-plan.md`
- `HANDOFF.md`

## Verification

- Document review only.

## Update - Free-tier cost clarification

- Clarified in `docs/persistence-plan.md` that this persistence approach can be implemented with $0 using common free tiers (Render free + Neon/Supabase free Postgres).
- Added caveats about free-tier limits and scaling later without schema redesign.

---

# HANDOFF - Neon Persistence Implementation (Wallet + Stocks)

## What Was Done

- Added Postgres connectivity module in `server/db.js` with pooled queries and transaction helper.
- Added SQL schema file `server/sql/persistence.sql` for `players`, `stock_positions`, and `wallet_ledger`.
- Refactored `server/currency.js` to async DB-backed balance operations with ledger writes.
- Refactored `server/stock-game.js` to async DB-backed portfolio operations with transactional buy/sell.
- Updated socket handlers to await async persistence calls for:
  - registration/get-balance
  - stock buy/sell/portfolio/leaderboard
  - Mäxchen betting and pot payouts
  - StrictBrain coin rewards
  - leave/disconnect room cleanup path
- Updated room manager pot payout path to async balance updates.
- Added `pg` dependency in `package.json`.

## Important Notes

- A local fallback remains for dev if `DATABASE_URL` is not configured.
- `npm i pg` failed in this execution environment with `403 Forbidden` from npm registry, so lockfile refresh could not be completed here.

## Files Changed

- `server/db.js`
- `server/sql/persistence.sql`
- `server/currency.js`
- `server/stock-game.js`
- `server/socket-handlers.js`
- `server/room-manager.js`
- `package.json`

## Verification

- `node --check server/socket-handlers.js`
- `node --check server/room-manager.js`
- `node --check server/currency.js`
- `node --check server/stock-game.js`
- `node --check server/db.js`
- Local `node server.js` start check in this environment is blocked by missing installed dependencies (e.g. `yahoo-finance2`), so runtime validation here is limited to syntax checks.

---

# HANDOFF - Pictochat Persistence

## What Was Done

- Added DB-backed persistence for pictochat strokes and messages so state survives server restarts.
- Created `server/pictochat-store.js` with load/save/delete/clear helpers for both strokes and messages.
- Extended `server/sql/persistence.sql` with `picto_strokes` and `picto_messages` tables.
- Updated all pictochat socket handlers in `server/socket-handlers.js` to persist state asynchronously after broadcasting.
- On first `picto-join`, server hydrates in-memory state from DB if it is empty (lazy load).
- Updated client `public/pictochat.js` to replay persisted messages on join via the `picto-state` event.
- In-memory fallback is preserved for local dev without `DATABASE_URL`.

## Files Changed

- `server/sql/persistence.sql` — added `picto_strokes` and `picto_messages` tables
- `server/pictochat-store.js` — new module for pictochat DB operations
- `server/socket-handlers.js` — import store, hydrate on join, persist on stroke/shape/undo/redo/clear/message
- `public/pictochat.js` — replay persisted messages on join

## Verification

- `node --check server/pictochat-store.js`
- `node --check server/socket-handlers.js`
- After deploying: draw strokes and send messages, restart server, verify state is restored on rejoin.
- Schema must be applied to the database (`picto_strokes`, `picto_messages` tables).
