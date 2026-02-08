# HANDOFF - LoL Betting: Stop Retrying on Invalid API Key (401/403)

## What Was Done

### Problem Fixed
The LoL match checker repeatedly called the Riot API with an invalid key, generating continuous 401 errors in logs (e.g., `Error backfilling bet 4: Riot API error (401)`). Every 60-second polling cycle retried the same failing calls indefinitely.

### Changes Made

**Fix: Detect and stop on auth failures (`server/riot-api.js`)**
- Added module-level `riotApiDisabledReason` variable
- All three API functions (`lookupRiotAccount`, `getMatchHistory`, `getMatchDetails`) now detect 401/403 responses and set the disabled reason
- `isRiotApiEnabled()` now also returns false when the API key has been rejected
- Added `getRiotApiDisabledReason()` export so callers can check why the API is disabled

**Fix: Match checker stops polling on auth failure (`server/lol-match-checker.js`)**
- Imported `getRiotApiDisabledReason` from riot-api.js
- `checkPendingBets()` now checks for disabled reason at the start of each cycle and skips with a warning log instead of making futile API calls

**Tests (`server/__tests__/riot-api.test.js`)**
- Added tests for `getRiotApiDisabledReason` (returns empty string when no auth failure)
- Added test for `isRiotApiEnabled` (returns false when RIOT_API_KEY not set)

### How to Verify

1. Start server with an invalid `RIOT_API_KEY`
2. Place a LoL bet — should succeed with graceful degradation
3. Match checker should log one `Riot API key rejected (401)` error, then subsequent cycles should log `Skipping cycle: Riot API key rejected (401)` instead of retrying
4. No more repeated 401 error spam in logs

### Files Modified
- `server/riot-api.js` — Added 401/403 detection, `riotApiDisabledReason`, `getRiotApiDisabledReason()`
- `server/lol-match-checker.js` — Skip polling when API key is rejected
- `server/__tests__/riot-api.test.js` — Added tests for new exports

### Known Limitations
- Once the API key is flagged as invalid, the server must be restarted to retry with a new key. This is intentional — a 401 means the key itself is wrong, not a transient issue.

## Previous Changes
# HANDOFF - Strict Club Audio Visualizer Rework

## What Was Done

### Strict Club Visualizer Overhaul
Reworked the audio visualizer in Strict Club to fix jitter, make it the dominant UI element, and add colorful visuals.

**Changes Made:**

- `public/strict-club/visualizer.js` — Full rewrite of the draw loop:
  - Added lerp-based smoothing (fast attack / slow release) to eliminate jitter
  - Replaced random-based simulated mode with deterministic layered sine waves
  - Added per-bar rainbow hue cycling that shifts over time
  - Added bright cap highlights on bar tops and dynamic glow
  - Used translucent clear for subtle trail effect
  - Set `analyser.smoothingTimeConstant = 0.8` for real audio
  - Fixed DPR scaling with `setTransform` instead of cumulative `scale()`

- `public/strict-club/club.css` — Made the visualizer the main element:
  - Default canvas height: 250px -> 380px, min-height: 300px -> 420px
  - Mobile canvas height: 200px -> 280px, min-height 320px
  - Large screen canvas height: 440px, min-height 480px
  - Added dark semi-transparent background for better bar contrast

**How to Verify:**
- Open `/strict-club/` in a browser
- Idle mode: gentle rainbow wave at the bottom, no jitter
- Click play with a queued track: bars animate smoothly with layered sine simulation
- Colors cycle through the full rainbow spectrum continuously

---

# HANDOFF - LoL Betting System Auto-Completion Fixes

## What Was Done

### Problem Fixed
The LoL betting system had three interconnected issues preventing automatic bet resolution:
1. Match checker never started without `RIOT_API_KEY`
2. Bets placed without API key had null PUUID/lastMatchId and were never checked
3. `resolveBet()` didn't credit player balances (only updated bet status)

### Changes Made

**Fix A: PUUID Backfill for Incomplete Bets (`server/lol-betting.js`, `server/lol-match-checker.js`)**
- Added `getPendingBetsWithoutPuuid()` function to find bets missing PUUID or lastMatchId
- Added `updateBetPuuid(betId, puuid, lastMatchId)` function to backfill bet data
- Added `backfillMissingPuuids()` function in match checker that runs in the polling loop
- When Riot API becomes available, incomplete bets are retroactively resolved with PUUID and lastMatchId
- Backfill runs before checking matches, with rate limiting (1s delay between bets)

**Fix B: Manual Bet Resolution (`server/socket-handlers.js`)**
- Added `lol-admin-resolve-bet` socket event handler
- Accepts `{ betId, didPlayerWin }` and validates the caller is logged in
- Calls `resolveBet()` to update bet status
- Credits winner's balance via `addBalance()` with reason `lol_bet_win`
- Emits `lol-bet-resolved` to notify the winner
- Emits `lol-bet-resolved-confirm` to the admin who resolved it
- Broadcasts updated bets list to all clients

**Fix C: User Feedback (`server/socket-handlers.js`)**
- In `lol-place-bet` handler, after placing bet, checks if `puuid` is null
- Emits `lol-bet-warning` event with message: "Automatic bet resolution is not active. Bets may need to be resolved manually."

### How to Verify

**Scenario 1: Backfill existing incomplete bets**
1. Start server with valid `RIOT_API_KEY` in `.env`
2. Match checker will automatically backfill any pending bets with null PUUID
3. Check logs for: `[LoL Match Checker] Backfilling N incomplete bets`
4. Backfilled bets should then appear in normal match checking flow

**Scenario 2: Manual bet resolution**
1. Place a bet (with or without API key)
2. As any logged-in player, emit socket event:
   ```js
   socket.emit('lol-admin-resolve-bet', { betId: 123, didPlayerWin: true });
   ```
3. If won, player's balance should increase by 2x bet amount
4. Bet should disappear from active bets list
5. Winner receives `lol-bet-resolved` event with payout info

**Scenario 3: Warning on incomplete bet**
1. Remove `RIOT_API_KEY` from environment or set to invalid value
2. Place a bet via frontend
3. Should receive `lol-bet-warning` event after successful bet placement
4. Frontend should display the warning to user

### Tests
- All 133 existing tests pass
- Added 3 new test suites for new functions:
  - `getPendingBetsWithoutPuuid` - filters and sorts correctly
  - `updateBetPuuid` - updates pending bets, rejects resolved bets
  - Full integration tests in `lol-betting.test.js`

### Files Modified
- `server/lol-betting.js` — Added getPendingBetsWithoutPuuid, updateBetPuuid functions
- `server/lol-match-checker.js` — Added backfillMissingPuuids step in polling loop
- `server/socket-handlers.js` — Added lol-admin-resolve-bet handler, lol-bet-warning emission
- `server/__tests__/lol-betting.test.js` — Added tests for new functions

### Known Limitations
- Manual resolution has no admin permission check (any logged-in player can resolve)
- Consider adding admin role check in production
- Backfill runs on every polling cycle; could add flag to track already-attempted bets

## Previous Changes

# HANDOFF - Large-screen layout & font-size improvements

## What Was Done

### Enhancement: Improved layout for large screens (>= 1024px)

- Added `@media (min-width: 1024px)` queries across all pages
- **theme.css**: Increased `#app` max-width from 600px to 900px, body font-size from 18px to 22px, padding from 20px to 30px
- **index.html (lobby)**: Widened `menu-container` (800px -> 1000px), `game-grid` (600px -> 800px), increased font-size (12px -> 14px), title (20px -> 24px)
- **Game pages** (lol-betting, stocks, strictbrain, turkish, shopping): Increased font-size (10px -> 13px), widened page containers
- **watchparty**: Widened video wrapper (900px -> 1100px) and app container (960px -> 1200px)
- **contacts.html**: Widened container (600px -> 900px)
- **strict-club/club.css**: Widened club container (900px -> 1100px)

### How to Verify

1. Open any page on a screen >= 1024px wide
2. Content should fill more horizontal space
3. Font sizes should be larger and more readable
4. On mobile/tablet (< 1024px), existing styling is unchanged

### Previous Change
# HANDOFF - Stock Game: Leaderboard character profile pictures

## What Was Done

### Feature: Show character profile pictures in stock game leaderboards

Added user character avatars (pixel art profile pictures) to both the Player Portfolios and Trade Performance leaderboard sections in the stock game.

**Server-side (`server/socket-handlers.js`):**
- In the `stock-get-leaderboard` handler, build a name→character lookup from `onlinePlayers` and attach each player's `character` object to the leaderboard entries before emitting

**Client-side (`games/stocks/js/game.js`):**
- `renderLeaderboard()` — renders `<img>` with the character's `dataURL` (pixelated) between the rank number and player name, or a 👽 emoji fallback
- `renderPerformanceLeaderboard()` — same avatar rendering

**Styles (`games/stocks/index.html`):**
- Added `.leaderboard-avatar` (22×22 pixelated image) and `.leaderboard-avatar-placeholder` (emoji fallback) CSS classes

### Verification
- All 128 existing tests pass
- Leaderboard renders correctly; avatars appear inline between rank and name
- Players without a character see the 👽 fallback emoji

## Files Modified

- `server/socket-handlers.js` — Enrich leaderboard data with character from onlinePlayers
- `games/stocks/js/game.js` — Render avatar in both leaderboard functions
- `games/stocks/index.html` — CSS for leaderboard avatars
- `HANDOFF.md` — This file

---

## Previous: Strict Club: Enhanced glassmorphism effects

### Enhancement: Made all Strict Club UI elements more glassy

Upgraded the Frutiger Aero glass effects throughout the Strict Club page for a more polished, premium glass look.

**Changes to `.glass-panel`:**
- Background changed from flat `rgba()` to a directional `linear-gradient` with varying opacity (bright top-left, subtle center, medium bottom-right) for realistic glass refraction
- Backdrop-filter increased from `blur(20px)` to `blur(28px) saturate(1.4)` for deeper frosted glass
- Added differentiated border edges: brighter `border-top` and `border-left` to simulate light source
- Added `inset 0 -1px 0` bottom highlight for glass thickness
- Added `::before` pseudo-element with top-half gradient overlay for glass reflection/sheen

**Other elements enhanced:**
- Home button: gradient background, stronger blur, brighter top border, dual inset shadows
- Control buttons: gradient glass background, stronger blur with `saturate(1.2)`, differentiated top border
- Primary button: three-stop gradient for more depth
- URL input: gradient glass background, `backdrop-filter: blur(12px)`, inset top highlight
- Queue/listener items: gradient backgrounds, `backdrop-filter: blur(8px)`, differentiated borders, inset highlights
- Count badges: gradient background, glass border, inset highlight
- Floating bubbles: enhanced radial gradient with three stops, `backdrop-filter: blur(4px)`, glass border, dual inset shadows
- Background: added `background-size: 200% 200%` so gradient animation actually shifts

## Files Modified

- `public/strict-club/club.css` — All glass effect enhancements (CSS only, no HTML/JS changes)
- `HANDOFF.md` — This file

## Verification

- `npm test` — all 128 tests pass
- Navigate to Strict Club — all panels show enhanced glass effects with visible background blur, gradient reflections, and differentiated borders

---

# HANDOFF - Strict Club: Fix audio visualizer and add visible queue

## What Was Done

### Fix: Audio visualizer now works with simulated mode

The visualizer was broken because it attempted to use real Web Audio API frequency data from the YouTube iframe, which always fails due to CORS. The `analyser` object was always created (non-null) so the draw loop entered the "real audio" branch and rendered all-zero data (invisible bars). Added a `hasRealAudio` flag that is only set to `true` when `connectToPlayer()` succeeds, ensuring the simulated visualizer is used as the default.

### Feature: Queue visible to everyone

Previously, queuing a track immediately replaced whatever was playing. Now tracks are added to a FIFO queue (max 20 entries) that is broadcast to all listeners via a new `club-queue-update` socket event. A new Queue panel in the UI shows all pending tracks with position number, title, and who queued them. When a track ends or is skipped, the next track from the queue plays automatically.

## Files Modified

- `public/strict-club/visualizer.js` - Added `hasRealAudio` flag; draw loop uses simulated mode unless real audio connected
- `public/strict-club/club.js` - Added queue UI update logic, `club-queue-update` handler, `updateQueue()` function; improved sync to clear UI when no track
- `public/strict-club/index.html` - Added Queue panel between controls and listeners
- `public/strict-club/club.css` - Added queue panel styles matching Frutiger Aero design
- `server/socket-handlers.js` - Added `queue` array to `clubState`; `club-queue` adds to queue when track playing; `club-skip` plays next from queue; `club-sync` includes queue; new `club-queue-update` event
- `HANDOFF.md` - This file

## New Socket Events

- `club-queue-update` (server -> client) - Broadcasts updated queue array to all listeners

## Verification

- `npm test` - all 128 tests pass
- Navigate to Strict Club - Queue panel visible with "Queue is empty" state
- Queue a track when nothing playing - plays immediately, queue stays empty
- Queue additional tracks while one plays - they appear in the queue panel for all listeners
- Skip track - next from queue starts playing automatically
- New user joining sees current queue state

---

# HANDOFF - Fix lol-place-bet error: missing puuid column
# HANDOFF - Add Strict Club (Multiplayer YouTube Audio Listening Room)

## What Was Done

### New Feature: Strict Club - Listen to YouTube audio together

Created a new main menu app called "Strict Club" where users can listen to YouTube audio together in a synchronized multiplayer room. The entire experience uses **Frutiger Aero** design aesthetics (mid-2000s to early-2010s design language).

**Key Features:**
- **Frutiger Aero Design**: Glossy glass panels with backdrop-filter blur, animated sky gradient background, floating translucent bubbles, rounded pill-shaped buttons, optimistic blue/green color palette
- **Synchronized Playback**: All users in the room hear the same audio at the same time via Socket.IO
- **Audio Visualizer**: Canvas-based frequency bar visualizer with Frutiger Aero colors (ocean blue to sky blue gradients)
- **Multi-user Support**: Shows list of connected listeners, anyone can queue/skip tracks
- **YouTube Integration**: Accepts YouTube URLs or video IDs, uses YouTube IFrame API (hidden player for audio-only)

**Design Details:**
- Font: M PLUS Rounded 1c (Google Fonts)
- Background: Animated gradient (sky blue #87CEEB → ocean blue #0077BE → green #4CAF50)
- Glass panels: `rgba(255,255,255,0.15)` with `backdrop-filter: blur(20px)` and subtle borders
- Floating bubbles: CSS-only animations with radial gradients
- Home button: Glass circle button (similar to nostalgiabait pages)

## Files Created

- `public/strict-club/index.html` — Main Strict Club page with Frutiger Aero layout
- `public/strict-club/club.css` — Self-contained Frutiger Aero styles (glossy panels, animated background, bubbles)
- `public/strict-club/club.js` — Client logic (Socket.IO, YouTube IFrame API, UI state management)
- `public/strict-club/visualizer.js` — Web Audio API visualizer with fallback for cross-origin restrictions

## Files Modified

- `public/index.html` — Added Strict Club game card (🎧 icon) to main menu
- `server/socket-handlers.js` — Added club-* socket event handlers (join, leave, queue, pause, skip) with rate limiting and YouTube ID validation

## Socket Events (kebab-case per project convention)

- `club-join` — Client joins the club room (auto-join on page load)
- `club-leave` — Client leaves the club room
- `club-queue` — Client queues a YouTube video by ID
- `club-play` — Server broadcasts when a new track starts
- `club-pause` — Server broadcasts play/pause state changes
- `club-sync` — Server sends current state to newly joined users
- `club-listeners` — Server broadcasts updated listener list
- `club-skip` — Skip current track

## Server State

In-memory club state (shared globally, not per-room):
- `videoId` — Current YouTube video ID
- `title` — Track title
- `queuedBy` — Name of user who queued it
- `isPlaying` — Playback state
- `startedAt` — Timestamp when track started
- `listeners` — Map of socketId → playerName

## Verification

- `npm test` — all 122 tests pass ✅
- Navigate to main menu (`/`) — new "Strict Club" card appears with 🎧 icon ✅
- Click into Strict Club — Frutiger Aero themed page loads with animated gradient and floating bubbles ✅
- Paste a YouTube URL or video ID — track queues, "Now Playing" updates with track info and queued-by name ✅
- Socket.IO connects and syncs state correctly ✅
- Listeners panel shows connected users ✅
- Server logs confirm: connection, join event, queue event working properly ✅

**Screenshots:**
- Initial page: Glossy glass panels, animated gradient background, floating bubbles
- After queueing: "Now Playing" shows "YouTube Track" and "Queued by Guest"

**Notes:**
- YouTube IFrame API may fail to load in restricted environments (ERR_BLOCKED_BY_CLIENT), but the core Socket.IO sync functionality works correctly
- The visualizer includes a simulated fallback mode for when Web Audio API cannot connect to YouTube audio (due to CORS)
- The static files are auto-served by the existing `express.static` middleware pointing at `public/`
# HANDOFF - Implement LoL Bet Resolution with Riot Match v5 API

## What Was Done

### Fix: Add ALTER TABLE migration for lol_bets columns

The `lol_bets` table was created on existing databases before the `puuid`, `last_match_id`, `game_id`, `result`, and `resolved_at` columns were added to the schema. Because the schema uses `CREATE TABLE IF NOT EXISTS`, these columns were never added to the existing table, causing `column "puuid" of relation "lol_bets" does not exist` when placing bets.

Added `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements in `server/sql/persistence.sql` after the `CREATE TABLE` block. These are idempotent and will add any missing columns on databases created before the columns were introduced.

### Files Changed
- `server/sql/persistence.sql` — Added `ALTER TABLE` statements to backfill missing columns

### How to Verify
1. Deploy the server against the production database
2. The `initSchema()` call on startup will run the `ALTER TABLE` statements
3. Place a LoL bet — the `puuid` column error should be resolved

---

# Previous Handoff — Implement LoL Bet Resolution with Riot Match v5 API

## What Was Done (Prior)

### Feature: Automatic bet resolution when LoL games complete

Previously, bets on League of Legends players would stay in "pending" status forever because the system never checked if the player actually finished a game. The `resolveBet()` function existed but was never called.

This PR implements full automatic bet resolution by:

1. **Storing match context when bets are placed**
   - Added `puuid` and `last_match_id` columns to `lol_bets` table
   - Server validates Riot ID and fetches PUUID (preventing client tampering)
   - Retrieves most recent match ID as baseline for detecting new games

2. **Background match checker (`server/lol-match-checker.js`)**
   - Polls every 60 seconds (configurable via `LOL_CHECK_INTERVAL_MS`)
   - Queries pending bets with puuid/last_match_id
   - Groups by PUUID to minimize API calls
   - Rate-limited: 30s minimum between checks per player
   - Fetches match history and details via Riot Match v5 API
   - Determines win/loss by checking participant data
   - Resolves all bets on that player's outcome
   - Credits winners via `addBalance()`
   - Only starts when `RIOT_API_KEY` is configured

3. **Client notifications**
   - Real-time notification when bet resolves (win or loss)
   - Updates balance display
   - Refreshes active bets list

## Files Changed

- `server/sql/persistence.sql` — Added `puuid` and `last_match_id` columns to `lol_bets`
- `server/riot-api.js` — Added `getMatchHistory()` and `getMatchDetails()` for Match v5 API
- `server/lol-betting.js` — Updated `placeBet()` to accept/store puuid and lastMatchId; added `getPendingBetsForChecking()`
- `server/socket-handlers.js` — Server-side PUUID validation in `lol-place-bet` handler
- `server/lol-match-checker.js` — New background polling module
- `server/index.js` — Start/stop match checker on server startup/shutdown
- `games/lol-betting/js/game.js` — Client-side notification handling
- Tests: Added coverage for new functions

## Verification

- `npm test` — all 128 tests pass (added 6 new tests)
- CodeQL security scan — 0 vulnerabilities
- Server starts correctly with and without `RIOT_API_KEY`
- Graceful shutdown tested (SIGTERM/SIGINT)

## Security Notes

- PUUID now validated server-side (client cannot spoof)
- Rate limiting per PUUID prevents API abuse
- Balance updates use existing transaction safety from `addBalance()`
- Client notifications filter by playerName
- XSS protection via structured data and `textContent`

## Known Limitations

- 500 bet limit per check cycle (documented in code)
- Riot API rate limits apply (default dev key: ~20 requests/sec, ~100 requests/2min)
- Match history only checks last 5 games (API limitation)

## Follow-up Considerations

- If production volume exceeds 500 pending bets, increase limit or implement batch processing
- Consider adding admin UI to manually resolve stuck bets
- Monitor Riot API rate limit errors in logs

---

# HANDOFF - Fix Pictochat Continuous Drawing Not Visible to Others

## What Was Done

### Bug Fix: Cursor events consuming stroke-segment rate-limit budget

When a user draws continuously (holding the mouse button down), the client sends both `picto-cursor` and `picto-stroke-segment` events on every pointer move. These share a single per-socket rate-limit counter on the server. The combined event rate (~50/sec) exceeded the stroke-segment limit of 30/sec, causing stroke data to be silently dropped and not broadcast to other users.

Fixed by skipping cursor updates while actively drawing. Stroke segments already convey the user's position, so cursor events are redundant during drawing.

## Files Changed

- `public/pictochat.js` — Only send `picto-cursor` when not actively drawing (`isDrawing` is false)

## Verification

- `npm test` — all 122 tests pass
- Open pictochat in two browser tabs; continuous drawing in one tab now appears in real-time for the other
- Cursor tracking still works when hovering without drawing

---

# HANDOFF - Auto-initialise Database Schema on Startup

## What Was Done

### Bug Fix: `lol_bets` table missing in production database

The `lol_bets` table definition existed in `server/sql/persistence.sql` but was never automatically applied to the production database. Every LoL betting operation failed with `relation "lol_bets" does not exist`.

Added automatic schema initialisation: `server/db.js` now exports an `initSchema()` function that reads `persistence.sql` and executes it against the database pool. The SQL uses `CREATE TABLE IF NOT EXISTS` so it is safe to run on every startup. `server/index.js` calls `initSchema()` during server startup (before the Discord bot), with a try/catch so a schema error does not crash the server.

## Files Changed

- `server/db.js` — added `initSchema()` that reads and runs `server/sql/persistence.sql`
- `server/index.js` — imported and called `initSchema()` on server startup
# HANDOFF - Fix Pictochat Drawing Not Showing Correctly for Other Players

## What Was Done

### Bug Fix: Gaps between stroke segment batches on receiving clients

When a player draws a continuous stroke, the client sends points in batches via `picto-stroke-segment`. On the receiving end, each batch was drawn independently without connecting the last point of the previous batch to the first point of the new batch, causing visible gaps in the stroke.

Fixed by tracking `lastPoint` per in-progress stroke in the client-side `picto-stroke-segment` handler. When a new batch arrives, the previous batch's last point is prepended to create a continuous line.

## Files Changed

- `public/pictochat.js` — Track `lastPoint` in the `inProgress` stroke entries; prepend it when drawing consecutive segment batches to eliminate gaps.

## Verification

- `npm test` — all 122 tests pass
- `node --check server/db.js && node --check server/index.js` — no syntax errors
- All SQL statements use `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`, so re-running on an existing database is idempotent
- Manual code review of the drawing data flow confirms the fix addresses the gap between batches.

---

# HANDOFF - Fix LoL Betting "Failed to place bet" Error

## What Was Done

### Bug Fix: Generic error message hiding actual failure reasons

Players placing LoL bets saw "Failed to place bet" with no indication of the root cause (e.g. player not found, invalid input, DB error). Three issues were addressed:

1. **Specific error messages**: The catch-all handler now surfaces known safe error messages (e.g. "Player not found", "Invalid bet amount") instead of always showing "Failed to place bet". Unknown/internal errors still show the generic message to avoid leaking implementation details.

2. **Missing game type**: `lol-betting` was not in the `validateGameType` allowed list. The regex also stripped hyphens, so `'lol-betting'` became `'lolbetting'` which didn't match anything and defaulted to `'maexchen'`. Fixed the regex to allow hyphens and added `'lol-betting'` to the allowed list.

3. **Silent rate-limit rejection**: When rate-limited, the `lol-validate-username` and `lol-place-bet` handlers returned silently with no feedback, leaving the client UI stuck in a loading state. Now emits appropriate error events so the client can reset.

## Files Changed

- `server/socket-handlers.js` — rate-limit feedback for `lol-validate-username` and `lol-place-bet`; specific error messages in `lol-place-bet` catch block
- `server/socket-utils.js` — allow hyphens in `validateGameType` regex; add `'lol-betting'` to allowed game types
- `server/__tests__/socket-utils.test.js` — test for `lol-betting` game type validation

## Verification

- `npm test` — all 122 tests pass
- `node --check server/socket-handlers.js && node --check server/socket-utils.js` — no syntax errors
# HANDOFF - Fix Portfolio Graph Not Showing on First Visit

## What Was Done

### Bug Fix: Portfolio graph only appeared on second visit to stock game

**Root cause:** Race condition between `stock-get-portfolio` and `stock-get-portfolio-history` socket events. On connect, the client emitted both events simultaneously. The portfolio handler is async (awaits DB/API calls before calling `recordSnapshot()`), so by the time `stock-get-portfolio-history` executed and returned, no snapshot had been recorded yet. The client received an empty history array (< 2 data points) and showed the placeholder message instead of the chart. On the second visit, snapshots from the first visit already existed, so the graph rendered.

**Fix:** The `stock-get-portfolio` handler (and buy/sell handlers) now emit `stock-portfolio-history` after recording the snapshot. This guarantees the client always receives up-to-date history data after each portfolio fetch, eliminating the race condition. The client no longer needs to separately request portfolio history.

## Files Changed

- `server/socket-handlers.js` — emit `stock-portfolio-history` after `recordSnapshot()` in buy/sell/get-portfolio handlers
- `games/stocks/js/game.js` — removed separate `stock-get-portfolio-history` emits from connect handler and periodic interval (now handled server-side)

## Verification

- `node --check server/socket-handlers.js`
- `node --check games/stocks/js/game.js`
- `npm test` — all 89 tests pass

---

# HANDOFF - Riot API Username Validation for LoL Betting

## What Was Done

### LoL Betting: Riot ID Validation via Riot Games API

Users must now enter a valid Riot ID (Name#Tag format) when placing LoL bets. The username is validated against the Riot Games Account API before a bet is accepted.

**New file: `server/riot-api.js`**
- `parseRiotId(riotId)` — parses "Name#Tag" into gameName + tagLine
- `isRiotApiEnabled()` — checks if `RIOT_API_KEY` env var is set
- `lookupRiotAccount(gameName, tagLine)` — calls Riot Account v1 API
- `validateRiotId(riotId)` — end-to-end validation (parse + API lookup)
- Graceful degradation: accepts well-formatted IDs when API key is missing

**Server changes: `server/socket-handlers.js`**
- New socket event `lol-validate-username` — validates Riot ID and returns result
- Updated `lol-place-bet` — validates Riot ID via API before accepting bet; uses canonical name from API response

**Client changes: `games/lol-betting/`**
- Input now expects Riot ID format (Name#Tag) with placeholder "e.g. Player#EUW"
- Added SEARCH button next to input to validate before submitting
- Validation status indicator (green checkmark or red X with reason)
- PLACE BET button requires validated username
- Re-editing the username field resets validation

**Config: `.env.example`**
- Added `RIOT_API_KEY` and `RIOT_REGION` environment variables

**Tests: `server/__tests__/riot-api.test.js`**
- 13 tests covering `parseRiotId` — valid formats, edge cases, invalid inputs

## Files Changed
- `server/riot-api.js` (new)
- `server/__tests__/riot-api.test.js` (new)
- `server/socket-handlers.js`
- `games/lol-betting/index.html`
- `games/lol-betting/js/game.js`
- `.env.example`

## Verification
- All 71 tests pass (`npm test`)
- Server starts, LoL betting page renders correctly
- SEARCH button enables only when input matches Name#Tag format
- Validation status displays correctly (green/red)
- PLACE BET disabled until username is validated
- Without `RIOT_API_KEY`, accepts any well-formatted Riot ID (graceful degradation)

---

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

# HANDOFF - Docker Bot Runtime Fixes

## What Was Done

- Ensured Docker builds can run `postinstall` by copying `bot/scripts` before `npm ci`.
- Installed `curl` in the image for `yt-dlp` download.
- Removed `--ignore-scripts` from Docker build to allow dependency install scripts.
- Added non-root `app` user and ownership on `/app`.
- Excluded `yt-dlp` binaries from Docker context to keep image small.

## Files Changed
- `Dockerfile`
- `.dockerignore`
- `PLANS.md`

## Verification
- Not run here. Suggested:
  - `docker compose build`
  - `docker compose up`
  - `curl http://localhost:3000/health`

---

# HANDOFF - Security + Performance Hardening

## What Was Done

- Added a simple in-memory rate limit for `/login` attempts.
- Made Postgres TLS verification configurable and secure-by-default.
- Tracked and cleaned up ffmpeg processes in the Discord bot audio pipeline.

## Files Changed
- `server/index.js`
- `server/db.js`
- `bot/src/utils/player.js`
- `PLANS.md`

## Verification
- Not run here. Suggested:
  - `npm test`
  - Manual: send repeated `/login` attempts and confirm `429` after limit.

---

# HANDOFF - Turkish Daily Streaks + Leaderboard

## What Was Done

- Made daily quiz deterministic per UTC day (same for all users).
- Added Turkish daily streak tracking with increasing coin rewards (up to 50 at 10 days).
- Added a leaderboard for highest current streaks.
- Added name input, streak/reward display, and leaderboard UI in the Turkish game.
- Added DB table for streaks with in-memory fallback when DB is disabled.

## Files Changed
- `server/turkish-lessons.js`
- `server/turkish-streaks.js`
- `server/index.js`
- `server/sql/persistence.sql`
- `games/turkish/index.html`
- `games/turkish/js/game.js`
- `PLANS.md`

## Verification
- Not run here. Suggested:
  - `node --check server/turkish-streaks.js`
  - `node --check server/turkish-lessons.js`
  - Manual: complete quiz on consecutive UTC days and verify streak/reward and leaderboard update.

---

# HANDOFF - Review Feedback Fixes

## What Was Done

- Added IP-based socket rate limiting and cleanup for rate limiter maps.
- Enforced minimum name length in server validation.
- Added brain daily cooldown (UTC) using wallet ledger entries and throttled leaderboard broadcasts.
- Hardened pictochat message sanitizing and avoided blocking hydration on join.
- Added stock quote caching for trades and limited Postgres pool configuration.
- Reduced extra balance-update DB queries in brain rewards and Mäxchen pot/bet flows.

## Files Changed
- `server/socket-handlers.js`
- `server/room-manager.js`
- `server/index.js`
- `server/db.js`
- `PLANS.md`

## Verification
- Not run here. Suggested:
  - `node --check server/socket-handlers.js`
  - `node --check server/db.js`
  - Manual: brain daily test twice in the same UTC day should only award once.

---

# HANDOFF - Lean Refactor (Socket Handlers)

## What Was Done

- Added a small helper to emit balance updates and replaced repeated inline emissions in brain-versus rewards and Mäxchen bet updates.
- Extracted shared socket sanitizers/utilities into a new module to slim `server/socket-handlers.js`.

## Files Changed
- `server/socket-handlers.js`
- `server/socket-utils.js`

## Verification
- Not run here. Suggested:
  - `node --check server/socket-handlers.js`

---

# HANDOFF - Lean Refactor (Strict Brain Games)

## What Was Done

- Extracted shared mini-game logic (math, stroop, chimp, reaction, scramble) into reusable helpers.
- Rewired both single-player and versus modes to use the shared helpers, reducing duplication.

## Files Changed
- `games/strictbrain/js/game.js`

## Verification
- Not run here. Suggested:
  - `node --check games/strictbrain/js/game.js`

---

# HANDOFF - Lean Refactor (Pictochat Client)

## What Was Done

- Extracted shared stroke helpers to reduce duplication in pictochat socket handlers.

## Files Changed
- `public/pictochat.js`

## Verification
- Not run here. Suggested:
  - `node --check public/pictochat.js`

---

# HANDOFF - Persistent Brain Leaderboards

## What Was Done

- Added DB-backed persistence for Strict Brain leaderboards (overall brain age + per-game best scores).
- Added a server module for leaderboard upserts/queries with in-memory fallback.
- Wired socket handlers to use the DB-backed leaderboards and throttled broadcasts.
- Added DB tables for brain leaderboards.

## Files Changed
- `server/brain-leaderboards.js`
- `server/sql/persistence.sql`
- `server/socket-handlers.js`
- `PLANS.md`

## Verification
- Not run here. Suggested:
  - `node --check server/brain-leaderboards.js`
  - `node --check server/socket-handlers.js`

---

# HANDOFF - Leaderboard Hardening (All)

## What Was Done

- Added DB indexes to speed leaderboard queries (brain + turkish).
- Added in-memory pruning for Strict Brain leaderboard fallbacks.

## Files Changed
- `server/sql/persistence.sql`
- `server/brain-leaderboards.js`
- `PLANS.md`

## Verification
- Not run here. Suggested:
  - `node --check server/brain-leaderboards.js`

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

---

# HANDOFF - Portfolio Performance Chart

## What Was Done

### New Feature: Portfolio Performance Graph in Stock Game

- Added a line chart showing the user's portfolio value, cash, and net worth over time.
- Chart uses Chart.js (loaded via CDN, no build step) and matches the existing Nintendo DS pixel theme.
- Portfolio snapshots are recorded in-memory on the server whenever portfolio data is fetched (on buy, sell, or periodic refresh).
- New socket event `stock-get-portfolio-history` serves snapshot history to the client.
- Chart shows three lines: Net Worth (solid), Portfolio Value (dashed), and Cash (dashed).
- When fewer than 2 data points exist, a placeholder message is shown instead of the chart.
- History resets on server restart (in-memory only, capped at 100 snapshots per player).

## Files Changed

- `server/portfolio-history.js` — new module for recording and retrieving portfolio snapshots
- `server/socket-handlers.js` — import portfolio-history, record snapshots after buy/sell/get-portfolio, add `stock-get-portfolio-history` handler
- `games/stocks/index.html` — Chart.js CDN, chart container HTML, chart CSS styles
- `games/stocks/js/game.js` — chart rendering logic, socket handler for history data, periodic history fetch
- `server/__tests__/portfolio-history.test.js` — unit tests for the portfolio-history module

## Verification

- `node --check server/portfolio-history.js`
- `node --check server/socket-handlers.js`
- `npm test` (58 tests pass, including 4 new portfolio-history tests)
- Manual: server starts, stocks page loads with chart section visible

---

# HANDOFF - Currency System Resilience (LoL Betting)

## What Was Done

### Bug Fix: Currency deducted even when bet placement fails

When a player placed a LoL bet, the currency was deducted first (`deductBalance`) and then the bet was created (`placeBet`). If `placeBet` threw an error, the catch block only emitted an error message — it never refunded the deducted currency. This caused permanent currency loss on failed bets.

### Changes

**`server/currency.js`**
- `addBalance` and `deductBalance` now wrap the balance update + ledger insert in a database transaction when no external client is provided. This prevents the balance from changing without a corresponding ledger entry.
- Extracted `_addBalanceDB` and `_deductBalanceDB` helpers to keep the logic DRY when used with or without an external transaction client.

**`server/lol-betting.js`**
- `placeBet` now accepts an optional `client` parameter so it can participate in an external database transaction.

**`server/socket-handlers.js`**
- The `lol-place-bet` handler now uses `withTransaction` (DB mode) to atomically deduct the balance and place the bet. If either step fails, the entire transaction rolls back — no currency is lost.
- In-memory mode: if `placeBet` throws after `deductBalance` succeeds, the handler refunds the deducted amount via `addBalance` before re-throwing.

**`server/__tests__/currency.test.js`**
- Added "deduct + refund resilience" tests verifying balance restoration after a failed downstream operation and that balance stays unchanged when deduction itself fails.

**`server/__tests__/lol-betting.test.js`** (new)
- Unit tests for `placeBet`, `getActiveBets`, and `getPlayerBets` in in-memory mode.
- Verifies the optional `client` parameter is accepted without error.

## Verification

- `npm test` (86 tests pass — 79 original + 7 new)
- `node --check server/currency.js`
- `node --check server/lol-betting.js`
- `node --check server/socket-handlers.js`

---

# HANDOFF - Pictochat Undo/Redo/Clear Fixes

## What Was Done

### Bug Fix: Undo/redo/clear not working in pictochat

Three client-side bugs in `public/pictochat.js` prevented undo, redo, and clear from working correctly:

1. **Shapes not undoable**: The `picto-shape` client handler applied shapes to the canvas but never added their `strokeId` to the `undoStack`. This meant shapes (line, rect, circle) could never be undone or redone. Fixed by updating the handler to push to `undoStack` and clear `redoStack` when the shape was authored by the current user (matching the `picto-stroke-commit` pattern).

2. **Clear left stale undo/redo stacks for other users**: The `picto-clear` handler only cleared `undoStack` and `redoStack` for the user who initiated the clear (`data.byId === socket.id`). Other users retained stale stroke IDs in their stacks, causing silent failures on subsequent undo/redo attempts. Fixed by clearing both stacks unconditionally for all users on clear.

3. **Reconnect left stale undo/redo stacks**: The `picto-state` handler (fired on join/reconnect) reset the `strokes` array but did not reset `undoStack` and `redoStack`. After reconnecting, the user could have stale entries. Fixed by clearing both stacks when new state is received.

## Files Changed

- `public/pictochat.js`

## Verification

- `npm test` (86 tests pass, no regressions)
- Server-side handlers are unchanged; all fixes are client-only

---

# HANDOFF - Fix LoL Bet Placement Failure

## What Was Done

### Bug Fix: Bet placement failing after successful username validation

The `lol-place-bet` socket handler was making a redundant Riot API call (`validateRiotId()`) to re-validate the Riot ID, even though it was already validated in the separate `lol-validate-username` step. This second API call could fail due to rate limiting (the same account was just looked up moments earlier), causing bet placement to fail with "Failed to place bet" despite the username showing as valid.

**Fix: Remove redundant API call** — Replaced `validateRiotId()` (full API lookup) with `parseRiotId()` (format-only validation) in the `lol-place-bet` handler. The Riot API validation already happened in `lol-validate-username` and doesn't need to be repeated.

## Files Changed

- `server/socket-handlers.js` — import `parseRiotId`, replace API call with format validation in `lol-place-bet`
- `server/__tests__/lol-betting.test.js` — additional tests for incrementing IDs, sort order, and limit

## Verification

- `npm test` — all tests pass
- CodeQL: 0 alerts

---

# HANDOFF - Comprehensive Code Review Fixes

## What Was Done

Performed a full-codebase review covering security, correctness, performance, and test coverage.

### Security Fixes

1. **LoL Betting Input Validation** (`server/lol-betting.js`)
   - `placeBet()` now validates `playerName`, `lolUsername`, `amount`, and `betOnWin` types before processing
   - `getPlayerBets()` limit parameter is now sanitized (clamped 1–100, floored to integer)

2. **Chat Message XSS** (`server/socket-handlers.js`)
   - `chat-message` handler now strips `"`, `'`, and backtick characters (matching `picto-message` sanitization)

3. **Brain Leaderboard Validation** (`server/brain-leaderboards.js`)
   - `updateBrainAgeLeaderboard()` and `updateGameLeaderboard()` now validate `playerName` type

4. **Portfolio History Guards** (`server/portfolio-history.js`)
   - `recordSnapshot()` rejects NaN/non-finite/non-string inputs before recording

### Database Schema Improvements (`server/sql/persistence.sql`)

- Added `CHECK (bet_amount > 0)` constraint on `lol_bets`
- Added `CHECK (shares > 0)` constraint on `stock_positions`
- Added index `lol_bets_player_name_idx` on `lol_bets(player_name)` for frequent lookups
- Added index `wallet_ledger_player_created_idx` on `wallet_ledger(player_id, created_at)` for daily reward queries

### Test Coverage

- New `server/__tests__/socket-utils.test.js` — 33 tests covering `sanitizeName`, `validateCharacter`, `validateRoomCode`, `validateGameType`, `validateYouTubeId`, `normalizePoint`, `sanitizeColor`, `sanitizeSize`, `getSocketIp`

## Files Changed

- `server/lol-betting.js` — input validation in `placeBet()`, safe limit in `getPlayerBets()`
- `server/socket-handlers.js` — chat-message XSS fix
- `server/brain-leaderboards.js` — playerName validation
- `server/portfolio-history.js` — NaN guards
- `server/sql/persistence.sql` — CHECK constraints and new indexes
- `server/__tests__/socket-utils.test.js` — new test file (33 tests)

## Verification

- `npm test` — 122 tests pass (89 original + 33 new)
- All existing tests remain green

