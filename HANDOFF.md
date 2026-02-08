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

---

# HANDOFF - Strict Brain Mascot (Prof. Dr. Strict)

## What Was Done

- Replaced the emoji professor placeholder in Strict Brain with a dedicated mascot image (`Prof. Dr. Strict`) on all relevant screens.
- Added a new SVG mascot asset at `games/strictbrain/assets/prof-dr-strict.svg`.
- Updated `.professor-alien` styles to support image rendering (fixed size, border, and themed background).

## Files Changed

- `games/strictbrain/index.html`
- `games/strictbrain/assets/prof-dr-strict.svg`
- `HANDOFF.md`

## Verification

- Confirmed markup updates for all professor slots in Strict Brain menu/training/versus/results screens.
- Attempted to run server for visual verification, but startup is blocked in this environment due to a missing dependency (`yahoo-finance2`).
# HANDOFF - Code Review Fixes (Round 1)

## What Was Done

### Bug Fixes & Cleanup across 7 files

- **`userinput/switch.mp3`** — renamed from `switch.mp3.mp3` (double extension bug)
- **`public/index.html`**, **`games/maexchen/index.html`**, **`games/watchparty/index.html`**, **`games/stocks/index.html`** — switch sound path fixed (`switch.mp3.mp3` -> `switch.mp3`), added `preload = 'auto'`, try/catch error handling, reduced timeout 300ms -> 250ms
- **`public/nostalgiabait/index.html`** — replaced per-frame `getImageData()`/`putImageData()` pixel noise loop with pre-rendered 128x128 noise texture pattern (major canvas performance improvement)
- **`server/socket-handlers.js`** — removed unused `ALLOWED_STOCK_SYMBOLS` Set (10 lines dead code)
- **`public/index.html`** — refactored 60+ `!important` declarations to `body .selector` scoping for CSS specificity; removed dead `game-desc` and `game-players` HTML divs (4 each) and their CSS rules

## Files Changed
- `userinput/switch.mp3` (renamed from `switch.mp3.mp3`)
- `public/index.html`
- `games/maexchen/index.html`
- `games/watchparty/index.html`
- `games/stocks/index.html`
- `public/nostalgiabait/index.html`
- `server/socket-handlers.js`

## Verification
- All 31 tests pass (`npm test`)
- Switch sound plays correctly on all game home buttons
- Nostalgiabait noise overlay renders without per-frame ImageData calls

---

# HANDOFF - Strict Brain Code Review Fixes

## What Was Done

### Security Fix: Server-side coin calculation
- Server no longer trusts client-sent `coins` values in `brain-submit-score` and `brain-training-score`
- Added `calculateBrainCoins(brainAge)` and `calculateTrainingCoins(score)` server functions
- Coin formula: brainAge <=25 -> 50SC, <=35 -> 30SC, <=45 -> 20SC, <=55 -> 10SC, >55 -> 5SC
- Training coins: half of daily test coins, minimum 2SC

### Bug Fix: Disconnect forfeit for brain versus
- When a player disconnects during a versus game, opponent now receives win + 20 coins
- Previously, generic `removePlayerFromRoom()` was called which knew nothing about brain versus forfeit logic

### Bug Fix: Versus reaction score display
- Changed from sending round count (1, 2, 3...) to running average reaction time in ms
- Now shows meaningful live comparison between players

### Bug Fix: Switch sound on home button
- Added switch sound + 250ms delay to brain home button (consistent with all other games)

### Bug Fix: Invalid German word in scramble
- Replaced `'HAUSE'` (not a standalone word) with `'HAFEN'` in word scramble

### Cleanup: Code deduplication
- `SCRAMBLE_WORDS` array (51 words) defined once at top, was duplicated in single + versus
- `GAME_NAMES` and `GAME_TAB_NAMES` (identical maps) merged into single `GAME_NAMES`
- `scrambleWord()` function defined once at top, was duplicated in single + versus

## Files Changed
- `server/socket-handlers.js` — server coin calc, disconnect forfeit
- `games/strictbrain/js/game.js` — reaction score, word fix, deduplication
- `games/strictbrain/index.html` — switch sound on home button

## Verification
- All 31 tests pass (`npm test`)
- Brain daily test: coins awarded match server-side calculation
- Versus disconnect: opponent gets forfeit win + 20 coins
- Home button: switch sound plays on click

## Open Items

### Resolved
- ~~CSS could be split into modules (theme.css is now ~2500 lines)~~ — Won't fix. No bundler in project, splitting would add multiple HTTP requests. File is well-sectioned with comment headers. Strict Brain + Stocks already use inline CSS.
- ~~`npm i pg` failed in Copilot environment~~ — Resolved. `pg` is in both `package.json` and `package-lock.json`.

### Remaining
- **~600 lines code duplication in `games/strictbrain/js/game.js`** — Each of 5 mini-games is fully duplicated for single-player and versus mode. Only difference: target DOM element IDs and score update callbacks. Works correctly but is a maintenance burden. Future refactor could parameterize game functions with `{ area, onScore, onFinish }` config objects.

---

# HANDOFF - Turkish Quiz State Machine Stabilization

## What Was Done

- Added explicit quiz session state in `games/turkish/js/game.js` via `quizEnded` and `answerTimeoutId`.
- Added central `resetQuizState()` called at quiz start to reset flags and clear any lingering interval/timeout handles.
- Updated `renderQuestion()` to return early when the quiz has already ended.
- Updated `handleAnswer()` to guard against post-end processing and to store the answer transition timeout handle.
- Updated `endQuiz()` to be idempotent, set `quizEnded = true`, stop the interval timer, and clear any pending answer timeout.

## Files Changed

- `games/turkish/js/game.js`
- `HANDOFF.md`

## Verification

- `node --check games/turkish/js/game.js`


---

# HANDOFF - MVP Umsetzungs-Checkliste (Self-hosted Stock-Game)

## What Was Done

- Added `docs/mvp-umsetzungs-checkliste.md` with a concrete, file-by-file implementation plan for the agreed MVP direction:
  - Self-hosted-first setup hardening
  - Stock command validation
  - Leaderboard/net-worth consistency
  - ENV feature toggles
  - Lightweight license-key flow
  - Minimal conversion tracking events
- Included per-step DoD and explicit verification commands to support small PR sequencing.

## Files Changed

- `docs/mvp-umsetzungs-checkliste.md`
- `HANDOFF.md`

## Verification

- Reviewed checklist structure and command list for consistency with current repo modules.

---

# HANDOFF - PR #1 Self-hosting Baseline (Docker + Docs)

## What Was Done

- Added containerization baseline without touching game or socket logic:
  - `Dockerfile` for production-style Node runtime
  - `.dockerignore` to keep image context small and avoid leaking local env files
  - `docker-compose.yml` for one-command startup and `/health` healthcheck
- Expanded `.env.example` with clearer required/optional grouping and forward-compatible keys (`GAME_*`, `LICENSE_*`) while keeping current `DISCORD_TOKEN` behavior intact.
- Updated `README.md` with a Docker quickstart and a short troubleshooting section (bot token, DB URL, host port conflict).
- Updated `PLANS.md` with an ExecPlan section for this multi-file setup task and recorded outcomes.

## Files Changed

- `Dockerfile`
- `.dockerignore`
- `docker-compose.yml`
- `.env.example`
- `README.md`
- `PLANS.md`
- `HANDOFF.md`

## Verification

- Attempted: `docker compose config` (environment limitation: docker not installed in this runtime)
- Attempted: `npm test` (environment limitation: `vitest` binary missing because dependencies are not installed in this runtime)

---

# HANDOFF - PR #2 Stock Command Hardening

## What Was Done

- Hardened stock trade input validation to accept only positive integer trade amounts for `stock-buy` and `stock-sell`.
- Added a lightweight per-socket stock trade cooldown (400ms) to reduce trade-spam bursts.
- Standardized stock error payloads via `{ code, message, error }` so clients can use structured codes while keeping backward compatibility with existing `error` handling.
- Extended stock engine error returns in `server/stock-game.js` with stable error `code` values (e.g. `INVALID_AMOUNT`, `INSUFFICIENT_FUNDS`, `NOT_ENOUGH_SHARES`, `TRANSACTION_FAILED`).
- Cleans up trade cooldown state on socket disconnect.

## Files Changed

- `server/socket-handlers.js`
- `server/stock-game.js`
- `HANDOFF.md`

## Verification

- `node --check server/socket-handlers.js`
- `node --check server/stock-game.js`
- `npm test`

