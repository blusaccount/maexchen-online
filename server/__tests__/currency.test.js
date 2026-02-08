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
    STARTING_BALANCE,
    buyDiamonds,
    getDiamonds
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

    describe('deduct + refund resilience', () => {
        it('balance is restored after deduct followed by addBalance refund', async () => {
            const player = 'player_resilience';
            const before = await getBalance(player);
            expect(before).toBe(STARTING_BALANCE);

            // Simulate deducting for a bet
            const afterDeduct = await deductBalance(player, 200, 'lol_bet');
            expect(afterDeduct).toBe(800);

            // Simulate bet placement failure — refund
            const afterRefund = await addBalance(player, 200, 'lol_bet_refund');
            expect(afterRefund).toBe(STARTING_BALANCE);
        });

        it('balance stays unchanged when deduction itself fails', async () => {
            const player = 'player_resilience_fail';
            const before = await getBalance(player);
            expect(before).toBe(STARTING_BALANCE);

            // Try to deduct more than balance
            const result = await deductBalance(player, STARTING_BALANCE + 1);
            expect(result).toBeNull();

            // Balance should remain unchanged
            const after = await getBalance(player);
            expect(after).toBe(STARTING_BALANCE);
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

    describe('getDiamonds', () => {
        it('returns 0 for a new player', async () => {
            const diamonds = await getDiamonds('player_diamonds_new');
            expect(diamonds).toBe(0);
        });
    });

    describe('buyDiamonds', () => {
        it('deducts 25 coins and adds 1 diamond', async () => {
            const player = 'player_buy_diamond';
            const initialBalance = await getBalance(player);
            expect(initialBalance).toBe(STARTING_BALANCE);

            const result = await buyDiamonds(player, 1);
            expect(result).not.toBeNull();
            expect(result.balance).toBe(STARTING_BALANCE - 25);
            expect(result.diamonds).toBe(1);

            const balance = await getBalance(player);
            expect(balance).toBe(STARTING_BALANCE - 25);

            const diamonds = await getDiamonds(player);
            expect(diamonds).toBe(1);
        });

        it('deducts 50 coins and adds 2 diamonds', async () => {
            const player = 'player_buy_2_diamonds';
            const result = await buyDiamonds(player, 2);
            expect(result).not.toBeNull();
            expect(result.balance).toBe(STARTING_BALANCE - 50);
            expect(result.diamonds).toBe(2);
        });

        it('returns null when insufficient balance', async () => {
            const player = 'player_insufficient_diamonds';
            await deductBalance(player, 990); // Leave 10 coins
            const result = await buyDiamonds(player, 1); // Needs 25 coins
            expect(result).toBeNull();
        });

        it('returns null for invalid count', async () => {
            const player = 'player_invalid_diamond_count';
            expect(await buyDiamonds(player, 0)).toBeNull();
            expect(await buyDiamonds(player, -1)).toBeNull();
            expect(await buyDiamonds(player, 1.5)).toBeNull();
        });

        it('accumulates diamonds over multiple purchases', async () => {
            const player = 'player_accumulate_diamonds';
            
            const result1 = await buyDiamonds(player, 1);
            expect(result1.diamonds).toBe(1);
            
            const result2 = await buyDiamonds(player, 2);
            expect(result2.diamonds).toBe(3);
            
            const diamonds = await getDiamonds(player);
            expect(diamonds).toBe(3);
        });
    });
});
