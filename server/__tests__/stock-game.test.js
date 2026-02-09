import { describe, it, expect, beforeEach, vi } from 'vitest';

let buyStock, sellStock, getPortfolioSnapshot, getLeaderboardSnapshot, getTradePerformanceLeaderboard;

beforeEach(async () => {
    vi.resetModules();
    // Mock db.js to disable database mode
    vi.doMock('../db.js', () => ({
        isDatabaseEnabled: () => false,
        query: vi.fn(),
        withTransaction: vi.fn(),
    }));
    // Mock currency.js for in-memory balances
    vi.doMock('../currency.js', () => {
        const balances = new Map();
        return {
            getBalance: async (name) => balances.get(name) ?? 1000,
            addBalance: async (name, amount) => {
                const current = balances.get(name) ?? 1000;
                const newBal = current + amount;
                balances.set(name, newBal);
                return newBal;
            },
            deductBalance: async (name, amount) => {
                const current = balances.get(name) ?? 1000;
                if (amount > current) return null;
                const newBal = current - amount;
                balances.set(name, newBal);
                return newBal;
            },
            getAllPlayerNamesMemory: () => Array.from(balances.keys()),
        };
    });

    const mod = await import('../stock-game.js');
    buyStock = mod.buyStock;
    sellStock = mod.sellStock;
    getPortfolioSnapshot = mod.getPortfolioSnapshot;
    getLeaderboardSnapshot = mod.getLeaderboardSnapshot;
    getTradePerformanceLeaderboard = mod.getTradePerformanceLeaderboard;
});

describe('stock-game portfolio snapshot', () => {
    it('uses ticker price when available', async () => {
        await buyStock('alice', 'AAPL', 150, 100);
        const quotes = [{ symbol: 'AAPL', name: 'Apple', price: 160 }];
        const snap = await getPortfolioSnapshot('alice', quotes);

        expect(snap.holdings).toHaveLength(1);
        expect(snap.holdings[0].currentPrice).toBe(160);
        expect(snap.holdings[0].marketValue).toBeGreaterThan(100);
    });

    it('falls back to avgCost when no price and no fetcher', async () => {
        await buyStock('alice', 'SHOP', 120, 100);
        // No SHOP in ticker quotes, no fetcher
        const quotes = [{ symbol: 'AAPL', name: 'Apple', price: 160 }];
        const snap = await getPortfolioSnapshot('alice', quotes);

        expect(snap.holdings).toHaveLength(1);
        expect(snap.holdings[0].currentPrice).toBe(120);
        expect(snap.holdings[0].marketValue).toBe(100);
    });

    it('uses fetchMissingPrice callback for non-ticker stocks', async () => {
        await buyStock('alice', 'SHOP', 120, 100);
        const quotes = [{ symbol: 'AAPL', name: 'Apple', price: 160 }];
        const fetchMissingPrice = vi.fn().mockResolvedValue({
            symbol: 'SHOP', name: 'Shopify', price: 140,
        });

        const snap = await getPortfolioSnapshot('alice', quotes, fetchMissingPrice);

        expect(fetchMissingPrice).toHaveBeenCalledWith('SHOP');
        expect(snap.holdings[0].currentPrice).toBe(140);
        expect(snap.holdings[0].name).toBe('Shopify');
        // ~0.8333 shares at 120, now worth 140 each
        expect(snap.holdings[0].marketValue).toBeGreaterThan(100);
    });

    it('does not call fetchMissingPrice for ticker stocks', async () => {
        await buyStock('alice', 'AAPL', 150, 100);
        const quotes = [{ symbol: 'AAPL', name: 'Apple', price: 160 }];
        const fetchMissingPrice = vi.fn();

        await getPortfolioSnapshot('alice', quotes, fetchMissingPrice);

        expect(fetchMissingPrice).not.toHaveBeenCalled();
    });

    it('caches fetched price in priceMap for duplicate symbols', async () => {
        // Two players hold the same non-ticker stock
        await buyStock('alice', 'SHOP', 120, 100);
        await buyStock('bob', 'SHOP', 125, 50);

        const quotes = [];
        const fetchMissingPrice = vi.fn().mockResolvedValue({
            symbol: 'SHOP', name: 'Shopify', price: 140,
        });

        const leaderboard = await getLeaderboardSnapshot(quotes, fetchMissingPrice);

        // fetchMissingPrice should only be called once since the price is cached in priceMap
        expect(fetchMissingPrice).toHaveBeenCalledTimes(1);
        expect(leaderboard.length).toBeGreaterThanOrEqual(2);
    });
});

describe('stock-game leaderboard', () => {
    it('uses fetchMissingPrice for non-ticker holdings', async () => {
        await buyStock('alice', 'SHOP', 120, 100);
        const quotes = [];
        const fetchMissingPrice = vi.fn().mockResolvedValue({
            symbol: 'SHOP', name: 'Shopify', price: 140,
        });

        const leaderboard = await getLeaderboardSnapshot(quotes, fetchMissingPrice);
        const alice = leaderboard.find(p => p.name === 'alice');

        expect(alice).toBeDefined();
        expect(alice.holdings[0].currentPrice).toBe(140);
        expect(fetchMissingPrice).toHaveBeenCalledWith('SHOP');
    });

    it('passes fetchMissingPrice through to performance leaderboard', async () => {
        await buyStock('alice', 'SHOP', 120, 100);
        const quotes = [];
        const fetchMissingPrice = vi.fn().mockResolvedValue({
            symbol: 'SHOP', name: 'Shopify', price: 140,
        });

        const performance = await getTradePerformanceLeaderboard(quotes, fetchMissingPrice);

        expect(fetchMissingPrice).toHaveBeenCalledWith('SHOP');
        const alice = performance.find(p => p.name === 'alice');
        expect(alice).toBeDefined();
        expect(alice.performancePct).toBeGreaterThan(0);
    });
});
