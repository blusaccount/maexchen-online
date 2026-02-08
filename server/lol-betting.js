// ============== LOL BETTING MANAGEMENT ==============

import { isDatabaseEnabled, query } from './db.js';

// In-memory fallback for local development without DATABASE_URL
const betsMemory = [];
let nextBetId = 1;

/**
 * Place a bet on a League of Legends player's next match
 */
export async function placeBet(playerName, lolUsername, amount, betOnWin, client = null) {
    if (typeof playerName !== 'string' || !playerName) {
        throw new Error('Invalid player name');
    }
    if (typeof lolUsername !== 'string' || !lolUsername) {
        throw new Error('Invalid LoL username');
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        throw new Error('Invalid bet amount');
    }
    if (typeof betOnWin !== 'boolean') {
        throw new Error('Invalid bet type');
    }

    if (!isDatabaseEnabled()) {
        const bet = {
            id: nextBetId++,
            playerName,
            lolUsername,
            amount,
            betOnWin,
            status: 'pending',
            createdAt: new Date().toISOString()
        };
        betsMemory.push(bet);
        return bet;
    }

    const queryRunner = client || { query };

    // Get player ID
    const playerResult = await queryRunner.query(
        'select id from players where name = $1',
        [playerName]
    );

    if (!playerResult.rows[0]) {
        throw new Error('Player not found');
    }

    const playerId = playerResult.rows[0].id;

    // Insert bet
    const result = await queryRunner.query(
        `insert into lol_bets (player_id, player_name, lol_username, bet_amount, bet_on_win, status)
         values ($1, $2, $3, $4, $5, 'pending')
         returning id, player_name, lol_username, bet_amount, bet_on_win, status, created_at`,
        [playerId, playerName, lolUsername, amount, betOnWin]
    );

    return {
        id: result.rows[0].id,
        playerName: result.rows[0].player_name,
        lolUsername: result.rows[0].lol_username,
        amount: Number(result.rows[0].bet_amount),
        betOnWin: result.rows[0].bet_on_win,
        status: result.rows[0].status,
        createdAt: result.rows[0].created_at
    };
}

/**
 * Get all active (pending) bets
 */
export async function getActiveBets() {
    if (!isDatabaseEnabled()) {
        return betsMemory.filter(bet => bet.status === 'pending')
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    const result = await query(
        `select id, player_name, lol_username, bet_amount, bet_on_win, status, created_at
         from lol_bets
         where status = 'pending'
         order by created_at desc
         limit 100`
    );

    return result.rows.map(row => ({
        id: row.id,
        playerName: row.player_name,
        lolUsername: row.lol_username,
        amount: Number(row.bet_amount),
        betOnWin: row.bet_on_win,
        status: row.status,
        createdAt: row.created_at
    }));
}

/**
 * Get player's bet history
 */
export async function getPlayerBets(playerName, limit = 20) {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(Number(limit)) || 20));

    if (!isDatabaseEnabled()) {
        return betsMemory
            .filter(bet => bet.playerName === playerName)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, safeLimit);
    }

    const result = await query(
        `select id, player_name, lol_username, bet_amount, bet_on_win, status, result, created_at, resolved_at
         from lol_bets
         where player_name = $1
         order by created_at desc
         limit $2`,
        [playerName, safeLimit]
    );

    return result.rows.map(row => ({
        id: row.id,
        playerName: row.player_name,
        lolUsername: row.lol_username,
        amount: Number(row.bet_amount),
        betOnWin: row.bet_on_win,
        status: row.status,
        result: row.result,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at
    }));
}

/**
 * Mock function to simulate resolving a bet
 * In production, this would integrate with Riot Games API
 * Note: This function is not exposed via socket handlers - it's for future admin/API use
 */
export async function resolveBet(betId, didPlayerWin) {
    if (!isDatabaseEnabled()) {
        const bet = betsMemory.find(b => b.id === betId);
        if (!bet || bet.status !== 'pending') {
            return null;
        }
        
        bet.status = 'resolved';
        bet.result = didPlayerWin;
        bet.resolvedAt = new Date().toISOString();
        
        // Calculate total payout (2x total return if won, which includes original bet)
        const wonBet = bet.betOnWin === didPlayerWin;
        return {
            bet,
            wonBet,
            payout: wonBet ? bet.amount * 2 : 0
        };
    }

    const result = await query(
        `update lol_bets
         set status = 'resolved', result = $2, resolved_at = now()
         where id = $1 and status = 'pending'
         returning player_id, player_name, bet_amount, bet_on_win`,
        [betId, didPlayerWin]
    );

    if (result.rows.length === 0) {
        return null;
    }

    const bet = result.rows[0];
    const wonBet = bet.bet_on_win === didPlayerWin;
    
    return {
        playerId: bet.player_id,
        playerName: bet.player_name,
        wonBet,
        payout: wonBet ? Number(bet.bet_amount) * 2 : 0  // 2x total return (includes original bet)
    };
}
