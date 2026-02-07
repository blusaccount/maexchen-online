import { describe, it, expect, vi } from 'vitest';

// Mock the db module so currency.js never touches a real database
vi.mock('../db.js', () => ({
    isDatabaseEnabled: () => false,
    query: vi.fn()
}));

const {
    getBalance,
    addBalance,
    deductBalance,
    getAllPlayerNamesMemory,
    STARTING_BALANCE
} = await import('../currency.js');

describe('currency (in-memory mode)', () => {
    it('exports STARTING_BALANCE as 1000', () => {
        expect(STARTING_BALANCE).toBe(1000);
    });

    describe('getBalance', () => {
        it('returns starting balance for a new player', async () => {
            const balance = await getBalance('newPlayer_get');
            expect(balance).toBe(STARTING_BALANCE);
        });
    });

    describe('addBalance', () => {
        it('adds amount to balance', async () => {
            const result = await addBalance('player_add', 500);
            expect(result).toBe(1500);
        });

        it('returns null for invalid amounts', async () => {
            expect(await addBalance('player_add_inv', -100)).toBeNull();
            expect(await addBalance('player_add_inv', 0)).toBeNull();
            expect(await addBalance('player_add_inv', NaN)).toBeNull();
            expect(await addBalance('player_add_inv', Infinity)).toBeNull();
        });

        it('rounds to two decimal places', async () => {
            const result = await addBalance('player_add_round', 0.1 + 0.2);
            // 1000 + 0.3 = 1000.3
            expect(result).toBe(1000.3);
        });
    });

    describe('deductBalance', () => {
        it('deducts amount from balance', async () => {
            const result = await deductBalance('player_deduct', 200);
            expect(result).toBe(800);
        });

        it('returns null when trying to deduct more than balance', async () => {
            const result = await deductBalance('player_deduct_over', 5000);
            expect(result).toBeNull();
        });

        it('returns null for invalid amounts', async () => {
            expect(await deductBalance('player_deduct_inv', -50)).toBeNull();
            expect(await deductBalance('player_deduct_inv', 0)).toBeNull();
        });
    });

    describe('getAllPlayerNamesMemory', () => {
        it('returns names of players who have been accessed', async () => {
            await getBalance('player_names_a');
            await getBalance('player_names_b');
            const names = getAllPlayerNamesMemory();
            expect(names).toContain('player_names_a');
            expect(names).toContain('player_names_b');
        });
    });
});
