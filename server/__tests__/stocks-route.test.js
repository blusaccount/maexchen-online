import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let createStocksRouter;

beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const mod = await import('../routes/stocks.js');
    createStocksRouter = mod.createStocksRouter;
});

afterEach(() => {
    vi.useRealTimers();
});

function makeRouter(mockQuote) {
    const mockYf = { quote: mockQuote };
    return createStocksRouter({
        getYahooFinance: async () => mockYf,
        isStockGameEnabled: true,
    });
}

function makeQuote(symbol, price, marketState) {
    return {
        symbol,
        regularMarketPrice: price,
        regularMarketChange: 0,
        regularMarketChangePercent: 0,
        currency: 'USD',
        shortName: symbol,
        ...(marketState !== undefined && { marketState }),
    };
}

describe('fetchTickerQuotes merge behavior', () => {
    it('returns fresh batch results', async () => {
        const mockQuote = vi.fn().mockResolvedValueOnce([
            makeQuote('AAPL', 150),
            makeQuote('MSFT', 400),
        ]);
        const router = makeRouter(mockQuote);

        const result = await router.fetchTickerQuotes();
        expect(result).toHaveLength(2);
        expect(result.find(r => r.symbol === 'AAPL').price).toBe(150);
        expect(result.find(r => r.symbol === 'MSFT').price).toBe(400);
    });

    it('preserves previously-cached symbols missing from a partial batch', async () => {
        const mockQuote = vi.fn()
            .mockResolvedValueOnce([makeQuote('AAPL', 150), makeQuote('MSFT', 400)])
            .mockResolvedValueOnce([makeQuote('AAPL', 155)]); // MSFT missing
        const router = makeRouter(mockQuote);

        const first = await router.fetchTickerQuotes();
        expect(first).toHaveLength(2);

        // Expire the 5-min cache
        vi.advanceTimersByTime(6 * 60 * 1000);

        const second = await router.fetchTickerQuotes();

        // AAPL updated, MSFT preserved from previous cache
        expect(second).toHaveLength(2);
        expect(second.find(r => r.symbol === 'AAPL').price).toBe(155);
        expect(second.find(r => r.symbol === 'MSFT').price).toBe(400);
    });

    it('updates symbols that appear in the new batch', async () => {
        const mockQuote = vi.fn()
            .mockResolvedValueOnce([makeQuote('AAPL', 150)])
            .mockResolvedValueOnce([makeQuote('AAPL', 160)]);
        const router = makeRouter(mockQuote);

        await router.fetchTickerQuotes();
        vi.advanceTimersByTime(6 * 60 * 1000);

        const result = await router.fetchTickerQuotes();
        expect(result).toHaveLength(1);
        expect(result[0].price).toBe(160);
    });

    it('returns stale cache on API error', async () => {
        const mockQuote = vi.fn()
            .mockResolvedValueOnce([makeQuote('AAPL', 150)])
            .mockRejectedValueOnce(new Error('API down'));
        const router = makeRouter(mockQuote);

        await router.fetchTickerQuotes();
        vi.advanceTimersByTime(6 * 60 * 1000);

        const result = await router.fetchTickerQuotes();
        expect(result).toHaveLength(1);
        expect(result[0].symbol).toBe('AAPL');
    });

    it('skips symbols with null regularMarketPrice', async () => {
        const mockQuote = vi.fn().mockResolvedValueOnce([
            makeQuote('AAPL', 150),
            { symbol: 'MSFT', regularMarketPrice: null, shortName: 'Microsoft' },
        ]);
        const router = makeRouter(mockQuote);

        const result = await router.fetchTickerQuotes();
        expect(result).toHaveLength(1);
        expect(result[0].symbol).toBe('AAPL');
    });

    it('includes marketState from Yahoo Finance quotes', async () => {
        const mockQuote = vi.fn().mockResolvedValueOnce([
            makeQuote('AAPL', 150, 'CLOSED'),
            makeQuote('BTC-USD', 97000, 'REGULAR'),
        ]);
        const router = makeRouter(mockQuote);

        const result = await router.fetchTickerQuotes();
        expect(result.find(r => r.symbol === 'AAPL').marketState).toBe('CLOSED');
        expect(result.find(r => r.symbol === 'BTC-USD').marketState).toBe('REGULAR');
    });

    it('sets marketState to null when not provided by API', async () => {
        const mockQuote = vi.fn().mockResolvedValueOnce([
            makeQuote('AAPL', 150),
        ]);
        const router = makeRouter(mockQuote);

        const result = await router.fetchTickerQuotes();
        expect(result[0].marketState).toBeNull();
    });
});
