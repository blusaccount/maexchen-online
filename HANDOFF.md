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
