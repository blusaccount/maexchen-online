import { Router } from 'express';

const TICKER_SYMBOLS = [
    // ETFs / Indices
    { symbol: 'URTH', name: 'MSCI World' },
    { symbol: 'QQQ', name: 'Nasdaq 100' },
    { symbol: '^GDAXI', name: 'DAX' },
    { symbol: 'DIA', name: 'DOW Jones' },
    { symbol: 'SPY', name: 'S&P 500' },
    { symbol: 'VGK', name: 'FTSE Europe' },
    { symbol: 'EEM', name: 'Emerging Mkts' },
    { symbol: 'IWM', name: 'Russell 2000' },
    { symbol: 'VTI', name: 'Total US Market' },
    { symbol: 'ARKK', name: 'ARK Innovation' },
    { symbol: 'XLF', name: 'Financials ETF' },
    { symbol: 'XLE', name: 'Energy ETF' },
    { symbol: 'GLD', name: 'Gold ETF' },
    { symbol: 'TLT', name: 'US Treasury 20+' },
    // Individual stocks
    { symbol: 'AAPL', name: 'Apple' },
    { symbol: 'MSFT', name: 'Microsoft' },
    { symbol: 'NVDA', name: 'NVIDIA' },
    { symbol: 'TSLA', name: 'Tesla' },
    { symbol: 'AMZN', name: 'Amazon' },
    { symbol: 'META', name: 'Meta' },
    { symbol: 'GOOGL', name: 'Alphabet' },
    { symbol: 'NFLX', name: 'Netflix' },
    { symbol: 'AMD', name: 'AMD' },
    { symbol: 'CRM', name: 'Salesforce' },
    { symbol: 'AVGO', name: 'Broadcom' },
    { symbol: 'ORCL', name: 'Oracle' },
    { symbol: 'ADBE', name: 'Adobe' },
    { symbol: 'DIS', name: 'Disney' },
    { symbol: 'PYPL', name: 'PayPal' },
    { symbol: 'INTC', name: 'Intel' },
    { symbol: 'BA', name: 'Boeing' },
    { symbol: 'V', name: 'Visa' },
    { symbol: 'JPM', name: 'JPMorgan Chase' },
    { symbol: 'WMT', name: 'Walmart' },
    { symbol: 'KO', name: 'Coca-Cola' },
    { symbol: 'PEP', name: 'PepsiCo' },
    { symbol: 'JNJ', name: 'Johnson & Johnson' },
    { symbol: 'PG', name: 'Procter & Gamble' },
    { symbol: 'BRK-B', name: 'Berkshire Hathaway' },
    { symbol: 'XOM', name: 'ExxonMobil' },
    { symbol: 'UNH', name: 'UnitedHealth' },
    // Metals & Resources
    { symbol: 'GC=F', name: 'Gold' },
    { symbol: 'SI=F', name: 'Silver' },
    { symbol: 'PL=F', name: 'Platinum' },
    { symbol: 'HG=F', name: 'Copper' },
    { symbol: 'CL=F', name: 'Crude Oil WTI' },
    { symbol: 'BZ=F', name: 'Brent Crude Oil' },
    { symbol: 'NG=F', name: 'Natural Gas' },
    // Crypto
    { symbol: 'BTC-USD', name: 'Bitcoin' },
    { symbol: 'ETH-USD', name: 'Ethereum' },
    { symbol: 'SOL-USD', name: 'Solana' },
    { symbol: 'BNB-USD', name: 'BNB' },
    { symbol: 'XRP-USD', name: 'XRP' },
    { symbol: 'ADA-USD', name: 'Cardano' },
    { symbol: 'DOGE-USD', name: 'Dogecoin' },
];

let tickerCache = { data: null, ts: 0 };
let tickerFetchPromise = null;
const TICKER_CACHE_MS = 5 * 60 * 1000; // 5 minutes

const searchCache = new Map();
const SEARCH_CACHE_MS = 10 * 60 * 1000; // 10 minutes

const singleQuoteCache = new Map();
const SINGLE_QUOTE_CACHE_MS = 2 * 60 * 1000; // 2 minutes

export function createStocksRouter({ getYahooFinance, isStockGameEnabled }) {
    const router = Router();

    async function fetchTickerQuotes() {
        const now = Date.now();
        if (tickerCache.data && now - tickerCache.ts < TICKER_CACHE_MS) {
            return tickerCache.data;
        }

        // Prevent concurrent fetches — reuse in-flight request
        if (tickerFetchPromise) return tickerFetchPromise;

        tickerFetchPromise = (async () => {
            try {
                const symbols = TICKER_SYMBOLS.map(s => s.symbol);
                const yf = await getYahooFinance();
                const quotes = await yf.quote(symbols);

                const nameMap = new Map(TICKER_SYMBOLS.map(s => [s.symbol, s.name]));
                const results = [];

                const quoteList = Array.isArray(quotes) ? quotes : [quotes];

                for (const q of quoteList) {
                    if (!q || q.regularMarketPrice == null) continue;

                    const price = q.regularMarketPrice;
                    const change = q.regularMarketChange ?? 0;
                    const pct = q.regularMarketChangePercent ?? 0;
                    const currency = q.currency || 'USD';
                    const rawSymbol = q.symbol || '';

                    results.push({
                        symbol: rawSymbol.replace('^', ''),
                        name: nameMap.get(rawSymbol) || q.shortName || rawSymbol.replace('^', ''),
                        price: parseFloat(price.toFixed(2)),
                        change: parseFloat(change.toFixed(2)),
                        pct: parseFloat(pct.toFixed(2)),
                        currency,
                    });
                }

                if (results.length > 0) {
                    tickerCache = { data: results, ts: Date.now() };
                }
                return results;
            } finally {
                tickerFetchPromise = null;
            }
        })();

        return tickerFetchPromise;
    }

    router.get('/api/ticker', async (req, res) => {
        if (!isStockGameEnabled) {
            return res.status(503).json({ code: 'GAME_DISABLED', error: 'Stock game is disabled by server config' });
        }
        try {
            const data = await fetchTickerQuotes();
            res.json(data);
        } catch (err) {
            console.error('[Ticker] Failed to fetch quotes:', err.message);
            // Return cached data if available, even if stale
            if (tickerCache.data) {
                return res.json(tickerCache.data);
            }
            res.status(502).json({ error: 'Failed to fetch quotes' });
        }
    });

    router.get('/api/stock-search', async (req, res) => {
        if (!isStockGameEnabled) {
            return res.status(503).json({ code: 'GAME_DISABLED', error: 'Stock game is disabled by server config' });
        }
        try {
            const query = (req.query.q || '').trim();
            if (!query || query.length < 1 || query.length > 30) {
                return res.json([]);
            }
            // Sanitise: only allow alphanumeric, spaces, dots, dashes
            const sanitised = query.replace(/[^a-zA-Z0-9 .\-]/g, '');
            if (!sanitised) return res.json([]);

            const cacheKey = sanitised.toUpperCase();
            const cached = searchCache.get(cacheKey);
            if (cached && Date.now() - cached.ts < SEARCH_CACHE_MS) {
                return res.json(cached.data);
            }

            const yf = await getYahooFinance();
            const results = await yf.search(sanitised, { quotesCount: 8, newsCount: 0 });
            const quotes = (results.quotes || [])
                .filter(q => q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF'))
                .slice(0, 8)
                .map(q => ({
                    symbol: q.symbol.replace('^', ''),
                    name: q.shortname || q.longname || q.symbol,
                    type: q.quoteType,
                    exchange: q.exchDisp || q.exchange || '',
                }));

            searchCache.set(cacheKey, { data: quotes, ts: Date.now() });
            // Limit cache size
            if (searchCache.size > 200) {
                const oldest = searchCache.keys().next().value;
                searchCache.delete(oldest);
            }

            res.json(quotes);
        } catch (err) {
            console.error('[StockSearch] Error:', err.message);
            res.json([]);
        }
    });

    router.get('/api/stock-quote', async (req, res) => {
        if (!isStockGameEnabled) {
            return res.status(503).json({ code: 'GAME_DISABLED', error: 'Stock game is disabled by server config' });
        }
        try {
            const symbol = (req.query.symbol || '').trim().toUpperCase().replace(/[^A-Z0-9.\-^]/g, '');
            if (!symbol || symbol.length > 12) {
                return res.status(400).json({ error: 'Invalid symbol' });
            }

            const cached = singleQuoteCache.get(symbol);
            if (cached && Date.now() - cached.ts < SINGLE_QUOTE_CACHE_MS) {
                return res.json(cached.data);
            }

            const yf = await getYahooFinance();
            const q = await yf.quote(symbol);
            if (!q || q.regularMarketPrice == null) {
                return res.status(404).json({ error: 'Symbol not found' });
            }

            const data = {
                symbol: (q.symbol || symbol).replace('^', ''),
                name: q.shortName || q.longName || symbol,
                price: parseFloat(q.regularMarketPrice.toFixed(2)),
                change: parseFloat((q.regularMarketChange ?? 0).toFixed(2)),
                pct: parseFloat((q.regularMarketChangePercent ?? 0).toFixed(2)),
                currency: q.currency || 'USD',
            };

            singleQuoteCache.set(symbol, { data, ts: Date.now() });
            if (singleQuoteCache.size > 500) {
                const oldest = singleQuoteCache.keys().next().value;
                singleQuoteCache.delete(oldest);
            }

            res.json(data);
        } catch (err) {
            console.error('[StockQuote] Error:', err.message);
            res.status(502).json({ error: 'Failed to fetch quote' });
        }
    });

    // Expose fetchTickerQuotes for socket handlers
    router.fetchTickerQuotes = fetchTickerQuotes;

    return router;
}
