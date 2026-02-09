import { placeBet, getActiveBets, getPlayerBets, resolveBet } from '../lol-betting.js';
import { parseRiotId, validateRiotId } from '../riot-api.js';
import { manualCheckBetStatus, scheduleBetTimeout } from '../lol-match-checker.js';
import { getBalance, deductBalance, addBalance } from '../currency.js';
import { emitBalanceUpdate } from '../socket-utils.js';
import { isDatabaseEnabled, withTransaction } from '../db.js';

export function registerLolBettingHandlers(socket, io, deps) {
    const { checkRateLimit, onlinePlayers } = deps;

    socket.on('lol-validate-username', async (data) => { try {
        if (!checkRateLimit(socket, 5)) {
            socket.emit('lol-username-result', { valid: false, reason: 'Too many requests, please wait' });
            return;
        }
        if (!data || typeof data !== 'object') return;

        const { riotId } = data;
        if (typeof riotId !== 'string') {
            socket.emit('lol-username-result', { valid: false, reason: 'Invalid input' });
            return;
        }

        const result = await validateRiotId(riotId);
        socket.emit('lol-username-result', result);
    } catch (err) {
        console.error('lol-validate-username error:', err.message);
        socket.emit('lol-username-result', { valid: false, reason: err.message || 'Validation failed' });
    } });

    // --- Place LoL Bet ---
    socket.on('lol-place-bet', async (data) => { try {
        if (!checkRateLimit(socket, 5)) {
            socket.emit('lol-bet-error', { message: 'Too many requests, please wait' });
            return;
        }
        if (!data || typeof data !== 'object') return;

        const player = onlinePlayers.get(socket.id);
        if (!player) {
            socket.emit('lol-bet-error', { message: 'Not logged in' });
            return;
        }
        const playerName = player.name;

        const { lolUsername, amount, betOnWin } = data;

        // Validate Riot ID format
        const parsed = parseRiotId(lolUsername);
        if (!parsed) {
            socket.emit('lol-bet-error', { message: 'Invalid Riot ID format. Use Name#Tag' });
            return;
        }
        const resolvedName = parsed.gameName + '#' + parsed.tagLine;

        const betAmount = Number(amount);
        if (!Number.isFinite(betAmount) || !Number.isInteger(betAmount) || betAmount <= 0 || betAmount > 1000) {
            socket.emit('lol-bet-error', { message: 'Invalid bet amount (1-1000 coins)' });
            return;
        }

        if (typeof betOnWin !== 'boolean') {
            socket.emit('lol-bet-error', { message: 'Invalid bet type' });
            return;
        }

        // Check balance
        const balance = await getBalance(playerName);
        if (balance < betAmount) {
            socket.emit('lol-bet-error', { message: 'Insufficient balance' });
            return;
        }

        // No server-side Riot API calls on bet placement
        const puuid = typeof data.puuid === 'string' ? data.puuid : null;
        const lastMatchId = null;

        let newBalance;
        let bet;

        if (isDatabaseEnabled()) {
            // DB mode: wrap deduction + bet in a single transaction so
            // both succeed or both roll back — no lost currency on failure.
            const txResult = await withTransaction(async (client) => {
                const bal = await deductBalance(playerName, betAmount, 'lol_bet', {
                    lolUsername: resolvedName,
                    betOnWin
                }, client);
                if (bal === null) {
                    return { ok: false };
                }
                const b = await placeBet(playerName, resolvedName, betAmount, betOnWin, puuid, lastMatchId, client);
                return { ok: true, newBalance: bal, bet: b };
            });
            if (!txResult.ok) {
                socket.emit('lol-bet-error', { message: 'Insufficient balance' });
                return;
            }
            newBalance = txResult.newBalance;
            bet = txResult.bet;
        } else {
            // In-memory mode: deduct first, refund if bet placement fails.
            newBalance = await deductBalance(playerName, betAmount, 'lol_bet', {
                lolUsername: resolvedName,
                betOnWin
            });
            if (newBalance === null) {
                socket.emit('lol-bet-error', { message: 'Insufficient balance' });
                return;
            }
            try {
                bet = await placeBet(playerName, resolvedName, betAmount, betOnWin, puuid, lastMatchId);
            } catch (betErr) {
                // Refund the deducted amount on failure
                await addBalance(playerName, betAmount, 'lol_bet_refund', {
                    lolUsername: resolvedName,
                    reason: betErr.message
                });
                throw betErr;
            }
        }

        // Send confirmation to player
        socket.emit('lol-bet-placed', {
            bet,
            newBalance
        });

        // Inform about manual resolution + timeout
        socket.emit('lol-bet-warning', {
            message: 'Bets resolve only via manual check. After 50 minutes they auto-resolve/refund.'
        });

        // Broadcast updated bets list to all clients
        const allBets = await getActiveBets();
        io.emit('lol-bets-update', { bets: allBets });

        scheduleBetTimeout(bet);

        console.log(`[LoL Bet] ${playerName} bet ${betAmount} on ${resolvedName} to ${betOnWin ? 'WIN' : 'LOSE'}`);
    } catch (err) {
        console.error('lol-place-bet error:', err.message);
        const safeMessages = [
            'Invalid player name',
            'Invalid LoL username',
            'Invalid bet amount',
            'Invalid bet type',
            'Player not found'
        ];
        const reason = safeMessages.includes(err.message)
            ? err.message
            : 'Failed to place bet';
        socket.emit('lol-bet-error', { message: reason });
    } });

    // --- Get Active LoL Bets ---
    socket.on('lol-get-bets', async () => { try {
        if (!checkRateLimit(socket)) return;

        const bets = await getActiveBets();
        socket.emit('lol-bets-update', { bets });
    } catch (err) {
        console.error('lol-get-bets error:', err.message);
    } });

    // --- Get Player LoL Bet History ---
    socket.on('lol-get-history', async () => { try {
        if (!checkRateLimit(socket)) return;

        const player = onlinePlayers.get(socket.id);
        if (!player) return;

        const history = await getPlayerBets(player.name);
        socket.emit('lol-history-update', { history });
    } catch (err) {
        console.error('lol-get-history error:', err.message);
    } });

    // --- Manual Check Bet Status ---
    socket.on('lol-check-bet-status', async (data) => { try {
        if (!checkRateLimit(socket, 5)) {
            socket.emit('lol-bet-check-result', { 
                success: false, 
                error: 'RATE_LIMITED',
                message: 'Too many requests, please wait' 
            });
            return;
        }

        if (!data || typeof data !== 'object') return;

        const player = onlinePlayers.get(socket.id);
        if (!player) {
            socket.emit('lol-bet-check-result', { 
                success: false, 
                error: 'NOT_LOGGED_IN',
                message: 'Not logged in' 
            });
            return;
        }

        const { betId } = data;
        const safeBetId = Number(betId);
        if (!Number.isInteger(safeBetId) || safeBetId <= 0) {
            socket.emit('lol-bet-check-result', { 
                success: false, 
                error: 'INVALID_BET_ID',
                message: 'Invalid bet ID' 
            });
            return;
        }

        // Call the manual check function
        const result = await manualCheckBetStatus(safeBetId, player.name);

        // Send result to the requesting player
        socket.emit('lol-bet-check-result', result);

        // If bet was resolved, broadcast updated bets list to all clients
        if (result.success && result.resolved) {
            const allBets = await getActiveBets();
            io.emit('lol-bets-update', { bets: allBets });

            // Update player's balance
            if (result.wonBet && result.payout > 0) {
                const newBalance = await getBalance(player.name);
                socket.emit('balance-update', { balance: newBalance });
            }
        }
    } catch (err) {
        console.error('lol-check-bet-status error:', err.message);
        socket.emit('lol-bet-check-result', { 
            success: false, 
            error: 'SERVER_ERROR',
            message: 'Failed to check bet status' 
        });
    } });

    // --- Admin Resolve LoL Bet ---
    socket.on('lol-admin-resolve-bet', async (data) => { try {
        if (!checkRateLimit(socket, 5)) {
            socket.emit('lol-bet-error', { message: 'Too many requests, please wait' });
            return;
        }

        if (!data || typeof data !== 'object') return;

        const player = onlinePlayers.get(socket.id);
        if (!player) {
            socket.emit('lol-bet-error', { message: 'Not logged in' });
            return;
        }

        // Admin permission check: require ADMIN_PASSWORD env var
        const adminPassword = process.env.ADMIN_PASSWORD;
        if (!adminPassword) {
            socket.emit('lol-bet-error', { message: 'Admin actions are not configured' });
            return;
        }
        if (typeof data.adminPassword !== 'string' || data.adminPassword !== adminPassword) {
            socket.emit('lol-bet-error', { message: 'Unauthorized: invalid admin credentials' });
            return;
        }

        const { betId, didPlayerWin } = data;

        // Validate inputs
        const safeBetId = Number(betId);
        if (!Number.isInteger(safeBetId) || safeBetId <= 0) {
            socket.emit('lol-bet-error', { message: 'Invalid bet ID' });
            return;
        }

        if (typeof didPlayerWin !== 'boolean') {
            socket.emit('lol-bet-error', { message: 'Invalid result (must be true or false)' });
            return;
        }

        // Resolve the bet
        const result = await resolveBet(safeBetId, didPlayerWin);

        if (!result) {
            socket.emit('lol-bet-error', { message: 'Bet not found or already resolved' });
            return;
        }

        const { playerName, wonBet, payout } = result;

        // Credit winner's balance if they won
        let newBalance = null;
        if (wonBet && payout > 0) {
            newBalance = await addBalance(playerName, payout, 'lol_bet_win', {
                betId: safeBetId,
                resolvedManually: true
            });
        }

        console.log(`[LoL Admin Resolve] ${player.name} manually resolved bet ${safeBetId}: ${playerName} ${wonBet ? 'won' : 'lost'} ${wonBet ? payout : 0} SC`);

        // Notify the player who won (if applicable)
        if (wonBet && newBalance !== null) {
            io.emit('lol-bet-resolved', {
                betId: safeBetId,
                playerName,
                wonBet,
                payout,
                newBalance
            });
        }

        // Broadcast updated bets list to all clients
        const allBets = await getActiveBets();
        io.emit('lol-bets-update', { bets: allBets });

        // Confirm to the admin who resolved it
        socket.emit('lol-bet-resolved-confirm', {
            betId: safeBetId,
            playerName,
            wonBet,
            payout
        });

    } catch (err) {
        console.error('lol-admin-resolve-bet error:', err.message);
        socket.emit('lol-bet-error', { message: 'Failed to resolve bet' });
    } });
}
