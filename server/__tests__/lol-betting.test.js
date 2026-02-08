import { describe, it, expect, vi } from 'vitest';

// Mock the db module so lol-betting.js never touches a real database
vi.mock('../db.js', () => ({
    isDatabaseEnabled: () => false,
    query: vi.fn()
}));

const { placeBet, getActiveBets, getPlayerBets } = await import('../lol-betting.js');

describe('lol-betting (in-memory mode)', () => {
    it('places a bet and returns it with correct fields', async () => {
        const bet = await placeBet('alice', 'Player#EUW', 100, true);
        expect(bet).toMatchObject({
            playerName: 'alice',
            lolUsername: 'Player#EUW',
            amount: 100,
            betOnWin: true,
            status: 'pending'
        });
        expect(bet.id).toBeTypeOf('number');
        expect(bet.createdAt).toBeTypeOf('string');
    });

    it('assigns incrementing IDs', async () => {
        const bet1 = await placeBet('bob', 'A#EUW', 50, false);
        const bet2 = await placeBet('bob', 'B#EUW', 75, true);
        expect(bet2.id).toBeGreaterThan(bet1.id);
    });

    it('returns active bets sorted newest first', async () => {
        await placeBet('carol', 'X#NA1', 10, true);
        await placeBet('dave', 'Y#NA1', 20, false);
        const active = await getActiveBets();
        expect(active.length).toBeGreaterThanOrEqual(2);
        // newest should appear first
        const dates = active.map(b => new Date(b.createdAt).getTime());
        for (let i = 1; i < dates.length; i++) {
            expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
        }
    });

    it('returns player-specific bets', async () => {
        await placeBet('eve', 'Z#EUW', 30, true);
        const eveBets = await getPlayerBets('eve');
        expect(eveBets.length).toBeGreaterThanOrEqual(1);
        eveBets.forEach(b => expect(b.playerName).toBe('eve'));
    });

    it('limits player bets to the requested count', async () => {
        for (let i = 0; i < 5; i++) {
            await placeBet('frank', `P${i}#EUW`, 10, true);
        }
        const limited = await getPlayerBets('frank', 3);
        expect(limited.length).toBe(3);
    });
});
