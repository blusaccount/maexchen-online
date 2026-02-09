// ============== LOL MATCH CHECKER ==============

import { resolveBet, getActiveBets, updateBetPuuid, getBetById, getPendingBetsForTimeout, refundBet } from './lol-betting.js';
import { addBalance } from './currency.js';
import { getMatchHistory, getMatchDetails, isRiotApiEnabled, validateRiotId, getRiotApiDisabledReason } from './riot-api.js';
import { withTransaction } from './db.js';

let io = null;
let isRunning = false;
const betTimeouts = new Map(); // betId -> timeoutId

const MATCH_HISTORY_CHECK_COUNT = 20;
const MATCH_DETAILS_SCAN_LIMIT = Math.max(1, Number(process.env.LOL_MATCH_SCAN_LIMIT) || 5);
const RATE_LIMIT_BACKOFF_MS = Math.max(10000, Number(process.env.LOL_RATE_LIMIT_BACKOFF_MS) || 180000);
const BET_TIMEOUT_MS = Math.max(1, Number(process.env.LOL_BET_TIMEOUT_MS) || (50 * 60 * 1000));

// Track last manual check time per bet ID to prevent abuse
const lastManualCheckTime = new Map(); // betId -> timestamp
const MIN_MANUAL_CHECK_INTERVAL = 10000; // 10 seconds minimum between manual checks for same bet
let riotRateLimitedUntil = 0;

function isRiotRateLimitError(err) {
    const msg = String(err?.message || '').toLowerCase();
    return msg.includes('rate limit');
}

function setRiotRateLimitBackoff() {
    riotRateLimitedUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
}

function isRiotRateLimited() {
    return Date.now() < riotRateLimitedUntil;
}

/**
 * Start the background match checker
 */
export async function startMatchChecker(socketIo) {
    io = socketIo;
    if (isRunning) {
        console.warn('[LoL Match Checker] Already running');
        return;
    }
    isRunning = true;
    console.log('[LoL Match Checker] Auto-checker disabled. Scheduling timeouts only.');
    await schedulePendingBetTimeouts();
}

/**
 * Stop the background match checker
 */
export function stopMatchChecker() {
    isRunning = false;
    for (const [, timeoutId] of betTimeouts) {
        clearTimeout(timeoutId);
    }
    betTimeouts.clear();
    console.log('[LoL Match Checker] Stopped');
}

export function scheduleBetTimeout(bet) {
    if (!bet || !bet.id || !bet.createdAt) return;
    if (betTimeouts.has(bet.id)) return;

    const createdAtMs = Date.parse(bet.createdAt);
    const now = Date.now();
    const dueMs = Number.isFinite(createdAtMs) ? (createdAtMs + BET_TIMEOUT_MS) : (now + BET_TIMEOUT_MS);
    const delay = Math.max(0, dueMs - now);

    const timeoutId = setTimeout(() => {
        betTimeouts.delete(bet.id);
        resolveBetByTimeout(bet).catch(err => {
            console.error(`[LoL Bet Timeout] Error resolving bet ${bet.id}:`, err.message);
        });
    }, delay);

    betTimeouts.set(bet.id, timeoutId);
}

export function clearBetTimeout(betId) {
    const timeoutId = betTimeouts.get(betId);
    if (timeoutId) {
        clearTimeout(timeoutId);
        betTimeouts.delete(betId);
    }
}

async function schedulePendingBetTimeouts() {
    const pendingBets = await getPendingBetsForTimeout();
    for (const bet of pendingBets) {
        scheduleBetTimeout(bet);
    }
}


async function getCachedMatchDetails(matchId, cache) {
    if (cache.has(matchId)) {
        return cache.get(matchId);
    }

    const details = await getMatchDetails(matchId);
    cache.set(matchId, details);
    return details;
}

async function selectResolvingMatchForBet(bet, matchIds, matchDetailsCache) {
    if (!bet || matchIds.length === 0) {
        return { matchId: null, matchDetails: null };
    }

    if (!bet.createdAt) {
        const matchId = matchIds[0];
        const matchDetails = await getCachedMatchDetails(matchId, matchDetailsCache);
        return { matchId, matchDetails };
    }

    const createdAtMs = Date.parse(bet.createdAt);
    if (!Number.isFinite(createdAtMs)) {
        const matchId = matchIds[0];
        const matchDetails = await getCachedMatchDetails(matchId, matchDetailsCache);
        return { matchId, matchDetails };
    }

    // Choose the oldest match that ended after bet placement (the player's
    // "next game"). matchIds arrive newest-first from the API, so we scan
    // them all and keep overwriting — the last hit is the oldest.
    let selectedMatchId = null;
    let selectedMatchDetails = null;

    for (const matchId of matchIds) {
        const matchDetails = await getCachedMatchDetails(matchId, matchDetailsCache);
        if (!matchDetails || !matchDetails.info || !matchDetails.info.participants) {
            continue;
        }

        const matchEndMs = getMatchEndTimestamp(matchDetails);
        if (matchEndMs && matchEndMs > createdAtMs) {
            selectedMatchId = matchId;
            selectedMatchDetails = matchDetails;
        }
    }

    return { matchId: selectedMatchId, matchDetails: selectedMatchDetails };
}

async function refundBetAndNotify(bet, reason, matchId = null) {
    const refund = await refundBet(bet.id);
    if (!refund) {
        return;
    }

    clearBetTimeout(bet.id);

    const newBalance = await addBalance(bet.playerName, refund.amount, 'lol_bet_refund', {
        betId: bet.id,
        lolUsername: bet.lolUsername,
        reason,
        matchId
    });

    if (io) {
        io.emit('lol-bet-refunded', {
            betId: bet.id,
            playerName: bet.playerName,
            lolUsername: bet.lolUsername,
            amount: refund.amount,
            reason,
            matchId,
            newBalance
        });

        const allBets = await getActiveBets();
        io.emit('lol-bets-update', { bets: allBets });
    }
}

/**
 * Resolve a bet and notify the player.
 * Returns the resolution result on success, or null on failure.
 */
async function resolveBetAndNotify(bet, didPlayerWin, matchId) {
    try {
        const result = await resolveBet(bet.id, didPlayerWin);
        
        if (!result) {
            console.warn(`[LoL Match Checker] Failed to resolve bet ${bet.id}`);
            return null;
        }

        clearBetTimeout(bet.id);

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
                betOnWin: bet.betOnWin,
                wonBet,
                payout,
                matchId,
                newBalance
            });

            // Broadcast updated bets list (resolved bets won't appear)
            const allBets = await getActiveBets();
            io.emit('lol-bets-update', { bets: allBets });
        }

        return result;
    } catch (err) {
        console.error(`[LoL Match Checker] Error resolving bet ${bet.id}:`, err.message);
        return null;
    }
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

    if (isRiotRateLimited()) {
        return {
            success: false,
            error: 'RATE_LIMIT_EXCEEDED',
            message: 'Riot API rate limit exceeded. Please try again in a few minutes.'
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
        if (!bet.puuid) {
            return {
                success: false,
                error: 'MISSING_DATA',
                message: 'This bet is missing player information and cannot be checked automatically.'
            };
        }

        // Update rate limit timestamp before making API calls
        lastManualCheckTime.set(betId, now);

        // Fetch match history
        const matchIds = await getMatchHistory(bet.puuid, MATCH_HISTORY_CHECK_COUNT);
        
        if (matchIds.length === 0) {
            return {
                success: true,
                resolved: false,
                message: 'No new match found yet. The player hasn\'t completed a game since this bet was placed.'
            };
        }

        const matchDetailsCache = new Map();
        const scanIds = matchIds.slice(0, MATCH_DETAILS_SCAN_LIMIT);
        const selection = await selectResolvingMatchForBet(bet, scanIds, matchDetailsCache);

        if (!selection.matchId) {
            return {
                success: true,
                resolved: false,
                message: 'No new match found yet. The player hasn\'t completed a game since this bet was placed.'
            };
        }

        // Process selected match
        const mostRecentMatchId = selection.matchId;
        const matchDetails = selection.matchDetails;
        
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
        const resolveResult = await resolveBetAndNotify(bet, didPlayerWin, mostRecentMatchId);

        if (!resolveResult) {
            return {
                success: false,
                error: 'RESOLVE_FAILED',
                message: 'Failed to resolve bet. Please try again.'
            };
        }

        const { wonBet, payout } = resolveResult;

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
        if (isRiotRateLimitError(err)) {
            setRiotRateLimitBackoff();
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

async function resolveBetByTimeout(bet) {
    try {
        const freshBet = await getBetById(bet.id);
        if (!freshBet || freshBet.status !== 'pending') {
            return;
        }

        if (!isRiotApiEnabled() || isRiotRateLimited()) {
            await refundBetAndNotify(freshBet, 'api_unavailable');
            return;
        }

        let puuid = freshBet.puuid;
        if (!puuid) {
            const validation = await validateRiotId(freshBet.lolUsername);
            if (!validation.valid || !validation.puuid) {
                await refundBetAndNotify(freshBet, 'missing_puuid');
                return;
            }
            puuid = validation.puuid;
            await updateBetPuuid(freshBet.id, puuid, null);
        }

        const matchIds = await getMatchHistory(puuid, MATCH_HISTORY_CHECK_COUNT);
        if (!matchIds.length) {
            await refundBetAndNotify(freshBet, 'no_match');
            return;
        }

        const scanIds = matchIds.slice(0, MATCH_DETAILS_SCAN_LIMIT);
        const matchDetailsCache = new Map();
        const selection = await selectResolvingMatchForBet(freshBet, scanIds, matchDetailsCache);
        if (!selection.matchId || !selection.matchDetails) {
            await refundBetAndNotify(freshBet, 'no_match_after_bet');
            return;
        }

        const participant = selection.matchDetails.info?.participants?.find(p => p.puuid === puuid);
        if (!participant) {
            await refundBetAndNotify(freshBet, 'player_not_found', selection.matchId);
            return;
        }

        const didPlayerWin = participant.win === true;
        await resolveBetAndNotify(freshBet, didPlayerWin, selection.matchId);
    } catch (err) {
        if (isRiotRateLimitError(err)) {
            setRiotRateLimitBackoff();
        }
        console.error(`[LoL Bet Timeout] Error resolving bet ${bet.id}:`, err.message);
        const freshBet = await getBetById(bet.id);
        if (freshBet && freshBet.status === 'pending') {
            await refundBetAndNotify(freshBet, 'timeout_error');
        }
    }
}
