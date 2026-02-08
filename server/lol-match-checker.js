// ============== LOL MATCH CHECKER ==============

import { getPendingBetsForChecking, resolveBet, getActiveBets, getPendingBetsWithoutPuuid, updateBetPuuid } from './lol-betting.js';
import { addBalance } from './currency.js';
import { getMatchHistory, getMatchDetails, isRiotApiEnabled, validateRiotId } from './riot-api.js';
import { withTransaction } from './db.js';

let checkerInterval = null;
let io = null;
let isRunning = false;

// Configurable interval (default: 60 seconds)
const CHECK_INTERVAL_MS = Number(process.env.LOL_CHECK_INTERVAL_MS) || 60000;

// Track last check time per PUUID to avoid excessive API calls
const lastCheckTime = new Map(); // puuid -> timestamp
const MIN_CHECK_INTERVAL_PER_PUUID = 30000; // 30 seconds minimum between checks for same PUUID

/**
 * Start the background match checker
 */
export function startMatchChecker(socketIo) {
    if (!isRiotApiEnabled()) {
        console.log('[LoL Match Checker] Skipped: RIOT_API_KEY not configured');
        return;
    }

    if (isRunning) {
        console.warn('[LoL Match Checker] Already running');
        return;
    }

    io = socketIo;
    isRunning = true;

    console.log(`[LoL Match Checker] Starting with ${CHECK_INTERVAL_MS}ms interval`);

    // Run immediately on start, then on interval
    checkPendingBets();
    checkerInterval = setInterval(checkPendingBets, CHECK_INTERVAL_MS);
}

/**
 * Stop the background match checker
 */
export function stopMatchChecker() {
    if (checkerInterval) {
        clearInterval(checkerInterval);
        checkerInterval = null;
    }
    isRunning = false;
    console.log('[LoL Match Checker] Stopped');
}

/**
 * Backfill PUUID and lastMatchId for bets that were placed without them
 * NOTE: This runs on every polling cycle. For production systems with high volume,
 * consider adding a retry counter or last_attempt timestamp to avoid repeatedly
 * attempting to backfill bets that consistently fail validation.
 */
async function backfillMissingPuuids() {
    try {
        const incompleteBets = await getPendingBetsWithoutPuuid();
        
        if (incompleteBets.length === 0) {
            return; // Nothing to backfill
        }

        console.log(`[LoL Match Checker] Backfilling ${incompleteBets.length} incomplete bets`);

        for (const bet of incompleteBets) {
            try {
                // Validate Riot ID and get PUUID
                const validation = await validateRiotId(bet.lolUsername);
                
                if (!validation.valid || !validation.puuid) {
                    console.warn(`[LoL Match Checker] Could not validate ${bet.lolUsername} for bet ${bet.id}`);
                    continue;
                }

                // Fetch last match ID
                const matchHistory = await getMatchHistory(validation.puuid, 1);
                if (matchHistory.length === 0) {
                    console.warn(`[LoL Match Checker] No match history for ${bet.lolUsername} (bet ${bet.id})`);
                    continue;
                }

                const lastMatchId = matchHistory[0];
                
                // Update bet with PUUID and lastMatchId
                const success = await updateBetPuuid(bet.id, validation.puuid, lastMatchId);
                
                if (success) {
                    console.log(`[LoL Match Checker] Backfilled bet ${bet.id}: ${bet.lolUsername} -> ${validation.puuid}`);
                }

                // Add small delay to respect rate limits
                await delay(1000);
            } catch (err) {
                console.error(`[LoL Match Checker] Error backfilling bet ${bet.id}:`, err.message);
                // Continue with next bet even if one fails
            }
        }
    } catch (err) {
        console.error('[LoL Match Checker] Error in backfill process:', err.message);
        // Don't crash the main loop
    }
}

/**
 * Main checking function - runs periodically
 */
async function checkPendingBets() {
    try {
        // STEP 1: Backfill PUUID and lastMatchId for bets that were placed without them
        await backfillMissingPuuids();

        // STEP 2: Check bets that have PUUID and lastMatchId
        const pendingBets = await getPendingBetsForChecking();
        
        if (pendingBets.length === 0) {
            return; // Nothing to check
        }

        // Group bets by PUUID to minimize API calls
        const betsByPuuid = new Map();
        for (const bet of pendingBets) {
            if (!betsByPuuid.has(bet.puuid)) {
                betsByPuuid.set(bet.puuid, []);
            }
            betsByPuuid.get(bet.puuid).push(bet);
        }

        console.log(`[LoL Match Checker] Checking ${pendingBets.length} bets for ${betsByPuuid.size} players`);

        // Check each unique PUUID
        for (const [puuid, bets] of betsByPuuid) {
            // Rate limiting: skip if we checked this PUUID too recently
            const lastCheck = lastCheckTime.get(puuid) || 0;
            const now = Date.now();
            if (now - lastCheck < MIN_CHECK_INTERVAL_PER_PUUID) {
                continue; // Skip this PUUID for now
            }

            try {
                await checkPlayerMatches(puuid, bets);
                lastCheckTime.set(puuid, now);
                
                // Add small delay between different players to respect rate limits
                await delay(1000);
            } catch (err) {
                console.error(`[LoL Match Checker] Error checking ${bets[0].lolUsername}:`, err.message);
                // Continue with next player even if one fails
            }
        }
    } catch (err) {
        console.error('[LoL Match Checker] Error in check loop:', err.message);
        // Don't crash the loop - just log and continue on next interval
    }
}

/**
 * Check for new matches for a specific player
 */
async function checkPlayerMatches(puuid, bets) {
    // Fetch recent match history
    const matchIds = await getMatchHistory(puuid, 5);
    
    if (matchIds.length === 0) {
        return; // No matches found
    }

    // Find the most recent lastMatchId among all bets for this player
    // (bets are ordered oldest first, so later bets have more recent lastMatchIds)
    let mostRecentLastMatchId = null;
    for (const bet of bets) {
        if (bet.lastMatchId) {
            mostRecentLastMatchId = bet.lastMatchId;
        }
    }

    if (!mostRecentLastMatchId) {
        return; // No baseline match to compare against
    }

    const baselineMatchIndex = matchIds.indexOf(mostRecentLastMatchId);
    
    // If lastMatchId not found in recent matches, check the most recent match
    let newMatches = [];
    if (baselineMatchIndex === -1) {
        // lastMatchId not in recent 5 - check most recent match only
        newMatches = [matchIds[0]];
    } else if (baselineMatchIndex > 0) {
        // Found lastMatchId, get all matches before it
        newMatches = matchIds.slice(0, baselineMatchIndex);
    }

    if (newMatches.length === 0) {
        return; // No new matches
    }

    // Process the most recent new match
    const mostRecentMatchId = newMatches[0];
    const matchDetails = await getMatchDetails(mostRecentMatchId);
    
    if (!matchDetails || !matchDetails.info || !matchDetails.info.participants) {
        console.warn(`[LoL Match Checker] Invalid match data for ${mostRecentMatchId}`);
        return;
    }

    // Find the player's participant entry
    const participant = matchDetails.info.participants.find(p => p.puuid === puuid);
    if (!participant) {
        console.warn(`[LoL Match Checker] Player not found in match ${mostRecentMatchId}`);
        return;
    }

    const didPlayerWin = participant.win === true;
    
    // Resolve all pending bets for this player
    for (const bet of bets) {
        await resolveBetAndNotify(bet, didPlayerWin, mostRecentMatchId);
    }
}

/**
 * Resolve a bet and notify the player
 */
async function resolveBetAndNotify(bet, didPlayerWin, matchId) {
    try {
        const result = await resolveBet(bet.id, didPlayerWin);
        
        if (!result) {
            console.warn(`[LoL Match Checker] Failed to resolve bet ${bet.id}`);
            return;
        }

        const { wonBet, payout } = result;

        // Credit winner's balance (addBalance already handles transactions internally)
        let newBalance = null;
        if (wonBet && payout > 0) {
            newBalance = await addBalance(bet.playerName, payout, 'lol_bet_win', {
                betId: bet.id,
                lolUsername: bet.lolUsername,
                matchId
            });
        }

        console.log(`[LoL Bet Resolved] ${bet.playerName} ${wonBet ? 'won' : 'lost'} ${wonBet ? payout : bet.amount} SC on ${bet.lolUsername} (match: ${matchId})`);

        // Emit socket event to notify the bettor
        if (io) {
            // Broadcast to all sockets - client will filter based on playerName
            io.emit('lol-bet-resolved', {
                betId: bet.id,
                playerName: bet.playerName,
                lolUsername: bet.lolUsername,
                amount: bet.amount,
                wonBet,
                payout,
                matchId,
                newBalance
            });

            // Broadcast updated bets list (resolved bets won't appear)
            const allBets = await getActiveBets();
            io.emit('lol-bets-update', { bets: allBets });
        }
    } catch (err) {
        console.error(`[LoL Match Checker] Error resolving bet ${bet.id}:`, err.message);
    }
}

/**
 * Utility: delay for a number of milliseconds
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if the checker is currently running
 */
export function isCheckerRunning() {
    return isRunning;
}
