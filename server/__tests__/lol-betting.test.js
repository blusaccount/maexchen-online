import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db module so lol-betting.js uses in-memory mode
vi.mock('../db.js', () => ({
    isDatabaseEnabled: () => false,
    query: vi.fn()
}));

const { placeBet, getActiveBets, getPlayerBets, resolveBet } = await import('../lol-betting.js');

describe('lol-betting (in-memory mode)', () => {
    describe('placeBet', () => {
        it('creates a pending bet', async () => {
            const bet = await placeBet('alice', 'Player#NA1', 100, true);
            expect(bet).toMatchObject({
                playerName: 'alice',
                lolUsername: 'Player#NA1',
                amount: 100,
                betOnWin: true,
                status: 'pending'
            });
            expect(bet.id).toBeDefined();
            expect(bet.createdAt).toBeDefined();
        });

        it('accepts optional client parameter without error', async () => {
            const bet = await placeBet('bob', 'Player#NA1', 50, false, null);
            expect(bet.playerName).toBe('bob');
        });
    });

    describe('getActiveBets', () => {
        it('returns pending bets', async () => {
            const bets = await getActiveBets();
            expect(bets.length).toBeGreaterThan(0);
            expect(bets.every(b => b.status === 'pending')).toBe(true);
        });
    });

    describe('getPlayerBets', () => {
        it('returns bets for a specific player', async () => {
            const bets = await getPlayerBets('alice');
            expect(bets.length).toBeGreaterThan(0);
            expect(bets.every(b => b.playerName === 'alice')).toBe(true);
        });

        it('returns empty array for unknown player', async () => {
            const bets = await getPlayerBets('unknown_player_xyz');
            expect(bets).toEqual([]);
        });
    });
});
