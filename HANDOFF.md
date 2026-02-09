# Handoff: Deduplicate game wrappers in games/strictbrain/js/game.js

## What Changed

Deduplicated the 10 individual game wrapper functions (5 single + 5 versus) in `games/strictbrain/js/game.js`:
- Added `GAME_CONFIGS` map with per-game DOM element IDs for both single and versus modes
- Added `launchGame(gameId, mode)` function that builds callbacks based on mode and calls the appropriate `run*Game()` engine
- `startSingleGame()` now calls `launchGame(gameId, 'single')` instead of a switch over individual wrappers
- `startVersusGame()` now calls `launchGame(gameId, 'versus')` instead of a switch over individual wrappers
- Deleted all 10 individual wrapper functions: `startMathGame`, `startStroopGame`, `startChimpGame`, `startReactionGame`, `startScrambleGame`, `startVersusMathGame`, `startVersusStroopGame`, `startVersusChimpGame`, `startVersusReactionGame`, `startVersusScrambleGame`
- All `run*Game()` engine functions are unchanged
- All special cases preserved: reaction clears score display, chimp single has `stopTimerFn: stopTimer` (versus: null), chimp single prepends 'Level ' to score display

## How to Verify
1. `npm test` — All 184 tests pass
2. Open StrictBrain in browser — all 5 mini-games work identically in both single-player and versus modes
