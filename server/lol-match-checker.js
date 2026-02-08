// ============== LOL MATCH CHECKER ==============

import { getPendingBetsForChecking, resolveBet, getActiveBets, getPendingBetsWithoutPuuid, updateBetPuuid, getBetById } from './lol-betting.js';
import { addBalance } from './currency.js';
import { getMatchHistory, getMatchDetails, isRiotApiEnabled, validateRiotId, getRiotApiDisabledReason } from './riot-api.js';
import { withTransaction } from './db.js';

let checkerInterval = null;
let io = null;
let isRunning = false;

// Configurable interval (default: 60 seconds)
const CHECK_INTERVAL_MS = Number(process.env.LOL_CHECK_INTERVAL_MS) || 60000;

// Track last check time per PUUID to avoid excessive API calls
const lastCheckTime = new Map(); // puuid -> timestamp
const MIN_CHECK_INTERVAL_PER_PUUID = 30000; // 30 seconds minimum between checks for same PUUID

// Track last manual check time per bet ID to prevent abuse
const lastManualCheckTime = new Map(); // betId -> timestamp
const MIN_MANUAL_CHECK_INTERVAL = 10000; // 10 seconds minimum between manual checks for same bet

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
        // Bail out early if API key was rejected (401/403)
        const disabledReason = getRiotApiDisabledReason();
        if (disabledReason) {
            console.warn(`[LoL Match Checker] Skipping cycle: ${disabledReason}`);
            return;
        }

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

    let cachedMatchDetails = null;
    let betsToResolve = bets;
    if (newMatches.length === 0) {
        const latestMatchId = matchIds[0];
        const betsWithLatestBaseline = bets.filter(bet => bet.lastMatchId === latestMatchId && bet.createdAt);
        if (betsWithLatestBaseline.length === 0) {
            return; // No new matches
        }

        cachedMatchDetails = await getMatchDetails(latestMatchId);
        if (!cachedMatchDetails || !cachedMatchDetails.info || !cachedMatchDetails.info.participants) {
            console.warn(`[LoL Match Checker] Invalid match data for ${latestMatchId}`);
            return;
        }

        const matchEndMs = getMatchEndTimestamp(cachedMatchDetails);
        if (!matchEndMs) {
            return; // Unable to determine match end time
        }

        const eligibleBets = betsWithLatestBaseline.filter(bet => {
            const createdAtMs = Date.parse(bet.createdAt);
            return Number.isFinite(createdAtMs) && matchEndMs > createdAtMs;
        });

        if (eligibleBets.length === 0) {
            return; // No new matches
        }

        newMatches = [latestMatchId];
        betsToResolve = eligibleBets;
    }

    // Process the most recent new match
    const mostRecentMatchId = newMatches[0];
    const matchDetails = cachedMatchDetails && mostRecentMatchId === matchIds[0]
        ? cachedMatchDetails
        : await getMatchDetails(mostRecentMatchId);
    
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
    for (const bet of betsToResolve) {
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

function getMatchEndTimestamp(matchDetails) {
    if (!matchDetails || !matchDetails.info) {
        return null;
    }

    if (Number.isFinite(matchDetails.info.gameEndTimestamp)) {
        return matchDetails.info.gameEndTimestamp;
    }

    if (Number.isFinite(matchDetails.info.gameCreation) && Number.isFinite(matchDetails.info.gameDuration)) {
        return matchDetails.info.gameCreation + Math.round(matchDetails.info.gameDuration * 1000);
    }

    return null;
}

/**
 * Check if the checker is currently running
 */
export function isCheckerRunning() {
    return isRunning;
}

/**
 * Manually check the status of a specific bet
 * 
 * @param {number} betId - The ID of the bet to check
 * @param {string} playerName - The name of the player requesting the check
 * @returns {Promise<Object>} Result object with the following structure:
 *   - success: {boolean} Whether the check completed without errors
 *   - error: {string} Error code (e.g., 'RATE_LIMITED', 'API_NOT_CONFIGURED', 'BET_NOT_FOUND')
 *   - message: {string} User-friendly message describing the result
 *   - resolved: {boolean} Whether the bet was resolved (only present if success=true and bet was resolved)
 *   - wonBet: {boolean} Whether the player won the bet (only present if resolved=true)
 *   - payout: {number} The payout amount (only present if resolved=true)
 *   - lolUsername: {string} The LoL username from the bet (only present if resolved=true)
 *   - matchId: {string} The match ID that resolved the bet (only present if resolved=true)
 */
export async function manualCheckBetStatus(betId, playerName) {
    // Rate limiting check
    const lastCheck = lastManualCheckTime.get(betId) || 0;
    const now = Date.now();
    if (now - lastCheck < MIN_MANUAL_CHECK_INTERVAL) {
        return {
            success: false,
            error: 'RATE_LIMITED',
            message: 'Please wait before checking this bet again (cooldown active).'
        };
    }

    // Check if Riot API is enabled
    if (!isRiotApiEnabled()) {
        const reason = getRiotApiDisabledReason();
        if (reason) {
            // API key was rejected
            return {
                success: false,
                error: 'API_REJECTED',
                message: 'Riot API key was rejected. Please contact an administrator.'
            };
        } else {
            // API key not configured
            return {
                success: false,
                error: 'API_NOT_CONFIGURED',
                message: 'Riot API is not configured. Please contact an administrator.'
            };
        }
    }

    try {
        // Fetch the bet
        const bet = await getBetById(betId);
        
        if (!bet) {
            return {
                success: false,
                error: 'BET_NOT_FOUND',
                message: 'Bet not found or already resolved.'
            };
        }

        // Verify bet belongs to player
        if (bet.playerName !== playerName) {
            return {
                success: false,
                error: 'PERMISSION_DENIED',
                message: 'You can only check your own bets.'
            };
        }

        // Check if bet is still pending
        if (bet.status !== 'pending') {
            return {
                success: false,
                error: 'BET_NOT_PENDING',
                message: 'Bet not found or already resolved.'
            };
        }

        // Check if bet has required data
        if (!bet.puuid || !bet.lastMatchId) {
            return {
                success: false,
                error: 'MISSING_DATA',
                message: 'This bet is missing player information and cannot be checked automatically.'
            };
        }

        // Update rate limit timestamp before making API calls
        lastManualCheckTime.set(betId, now);

        // Fetch match history
        const matchIds = await getMatchHistory(bet.puuid, 5);
        
        if (matchIds.length === 0) {
            return {
                success: true,
                resolved: false,
                message: 'No new match found yet. The player hasn\'t completed a game since this bet was placed.'
            };
        }

        // Check if there's a new match since the bet was placed
        const baselineMatchIndex = matchIds.indexOf(bet.lastMatchId);
        
        let newMatches = [];
        if (baselineMatchIndex === -1) {
            // lastMatchId not in recent 5 - check most recent match only
            newMatches = [matchIds[0]];
        } else if (baselineMatchIndex > 0) {
            // Found lastMatchId, get all matches before it
            newMatches = matchIds.slice(0, baselineMatchIndex);
        }

        let cachedMatchDetails = null;
        if (newMatches.length === 0 && baselineMatchIndex === 0 && bet.createdAt) {
            const createdAtMs = Date.parse(bet.createdAt);
            if (Number.isFinite(createdAtMs)) {
                cachedMatchDetails = await getMatchDetails(matchIds[0]);
                const matchEndMs = getMatchEndTimestamp(cachedMatchDetails);
                if (matchEndMs && matchEndMs > createdAtMs) {
                    newMatches = [matchIds[0]];
                }
            }
        }

        if (newMatches.length === 0) {
            return {
                success: true,
                resolved: false,
                message: 'No new match found yet. The player hasn\'t completed a game since this bet was placed.'
            };
        }

        // Process the most recent new match
        const mostRecentMatchId = newMatches[0];
        const matchDetails = cachedMatchDetails && mostRecentMatchId === matchIds[0]
            ? cachedMatchDetails
            : await getMatchDetails(mostRecentMatchId);
        
        if (!matchDetails || !matchDetails.info || !matchDetails.info.participants) {
            return {
                success: false,
                error: 'INVALID_MATCH_DATA',
                message: 'Match data is incomplete or invalid. Please try again later.'
            };
        }

        // Find the player's participant entry
        const participant = matchDetails.info.participants.find(p => p.puuid === bet.puuid);
        if (!participant) {
            return {
                success: false,
                error: 'PLAYER_NOT_FOUND',
                message: 'Player not found in match data.'
            };
        }

        const didPlayerWin = participant.win === true;
        
        // Resolve the bet
        await resolveBetAndNotify(bet, didPlayerWin, mostRecentMatchId);

        const wonBet = bet.betOnWin === didPlayerWin;
        const payout = wonBet ? bet.amount * 2 : 0;

        return {
            success: true,
            resolved: true,
            wonBet,
            payout,
            lolUsername: bet.lolUsername,
            matchId: mostRecentMatchId,
            message: wonBet 
                ? `✅ Bet resolved! You won ${payout} SC!`
                : '❌ Bet resolved. You lost this bet.'
        };
    } catch (err) {
        console.error('[Manual Check] Error:', err.message);
        
        // Handle specific error types
        if (err.message.includes('rate limit')) {
            return {
                success: false,
                error: 'RATE_LIMIT_EXCEEDED',
                message: 'Riot API rate limit exceeded. Please try again in a few minutes.'
            };
        }
        
        if (err.message.includes('401') || err.message.includes('403')) {
            return {
                success: false,
                error: 'API_REJECTED',
                message: 'Riot API key was rejected. Please contact an administrator.'
            };
        }

        return {
            success: false,
            error: 'API_ERROR',
            message: 'Riot API error. Please try again later.'
        };
    }
}
