import { buyStock, sellStock, getPortfolioSnapshot, getAllPortfolioPlayerNames, getLeaderboardSnapshot, getTradePerformanceLeaderboard } from '../stock-game.js';
import { recordSnapshot, getHistory } from '../portfolio-history.js';
import { emitStockError, emitBalanceUpdate } from '../socket-utils.js';
import { getBalance } from '../currency.js';

const stockQuoteCache = new Map(); // symbol -> { quote, ts }
const STOCK_QUOTE_CACHE_MS = 60 * 1000;

let _stockGameEnabled = true;
let _fetchTickerQuotes = null;
let _getYahooFinance = null;

function parseTradeAmount(rawAmount) {
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
        return null;
    }
    return amount;
}

async function getQuoteForSymbol(symbol, quotes, _getYahooFinance) {
    let quote = quotes.find(q => q.symbol === symbol);
    if (quote) return quote;

    const cached = stockQuoteCache.get(symbol);
    if (cached && Date.now() - cached.ts < STOCK_QUOTE_CACHE_MS) {
        return cached.quote;
    }

    if (!_getYahooFinance) return null;
    try {
        const yf = await _getYahooFinance();
        const q = await yf.quote(symbol);
        if (q && q.regularMarketPrice != null) {
            quote = {
                symbol: (q.symbol || symbol).replace('^', ''),
                name: q.shortName || q.longName || symbol,
                price: parseFloat(q.regularMarketPrice.toFixed(2)),
            };
            stockQuoteCache.set(symbol, { quote, ts: Date.now() });
            return quote;
        }
    } catch (e) {
        return null;
    }

    return null;
}

export function registerStocksHandlers(socket, io, deps) {
    const { checkRateLimit, checkStockTradeCooldown, onlinePlayers, isStockGameEnabled, fetchTickerQuotes, getYahooFinance } = deps;
    _stockGameEnabled = isStockGameEnabled;
    _fetchTickerQuotes = fetchTickerQuotes;
    _getYahooFinance = getYahooFinance;

    const fetchMissingPrice = (sym) => getQuoteForSymbol(sym, [], _getYahooFinance);
    
    socket.on('stock-buy', async (data) => { try {
        if (!checkRateLimit(socket)) return;
        if (!_stockGameEnabled) {
            emitStockError(socket, 'GAME_DISABLED', 'Stock game is disabled by server config');
            return;
        }
        const player = onlinePlayers.get(socket.id);
        if (!player) return;
        if (!data || typeof data !== 'object') return;

        const symbol = typeof data.symbol === 'string'
            ? data.symbol.replace(/[^A-Z0-9.\-=]/g, '').slice(0, 12) : '';
        if (!symbol) {
            emitStockError(socket, 'INVALID_SYMBOL', 'Invalid symbol');
            return;
        }
        const amount = parseTradeAmount(data.amount);
        if (amount === null) {
            emitStockError(socket, 'INVALID_AMOUNT', 'Amount must be a positive integer');
            return;
        }
        if (!checkStockTradeCooldown(socket.id)) {
            emitStockError(socket, 'TRADE_COOLDOWN', 'Trade requests are too fast');
            return;
        }

        // Get current price from ticker cache or live lookup
        const quotes = _fetchTickerQuotes ? await _fetchTickerQuotes() : [];
        const quote = await getQuoteForSymbol(symbol, quotes, _getYahooFinance);
        if (!quote) {
            emitStockError(socket, 'PRICE_UNAVAILABLE', 'Price unavailable');
            return;
        }

        const result = await buyStock(player.name, quote.symbol, quote.price, amount);
        if (!result.ok) {
            emitStockError(socket, result.code || 'BUY_FAILED', result.error || 'Buy failed');
            return;
        }

        socket.emit('balance-update', { balance: result.newBalance });
        const snapshot = await getPortfolioSnapshot(player.name, quotes, fetchMissingPrice);
        socket.emit('stock-portfolio', snapshot);
        recordSnapshot(player.name, snapshot.totalValue, result.newBalance);
        socket.emit('stock-portfolio-history', getHistory(player.name));
    } catch (err) { console.error('stock-buy error:', err.message); } });

    // --- Stock Game: Sell ---
    socket.on('stock-sell', async (data) => { try {
        if (!checkRateLimit(socket)) return;
        if (!_stockGameEnabled) {
            emitStockError(socket, 'GAME_DISABLED', 'Stock game is disabled by server config');
            return;
        }
        const player = onlinePlayers.get(socket.id);
        if (!player) return;
        if (!data || typeof data !== 'object') return;

        const symbol = typeof data.symbol === 'string'
            ? data.symbol.replace(/[^A-Z0-9.\-=]/g, '').slice(0, 12) : '';
        if (!symbol) {
            emitStockError(socket, 'INVALID_SYMBOL', 'Invalid symbol');
            return;
        }
        const amount = parseTradeAmount(data.amount);
        if (amount === null) {
            emitStockError(socket, 'INVALID_AMOUNT', 'Amount must be a positive integer');
            return;
        }
        if (!checkStockTradeCooldown(socket.id)) {
            emitStockError(socket, 'TRADE_COOLDOWN', 'Trade requests are too fast');
            return;
        }

        const quotes = _fetchTickerQuotes ? await _fetchTickerQuotes() : [];
        const quote = await getQuoteForSymbol(symbol, quotes, _getYahooFinance);
        if (!quote) {
            emitStockError(socket, 'PRICE_UNAVAILABLE', 'Price unavailable');
            return;
        }

        const result = await sellStock(player.name, quote.symbol, quote.price, amount);
        if (!result.ok) {
            emitStockError(socket, result.code || 'SELL_FAILED', result.error || 'Sell failed');
            return;
        }

        socket.emit('balance-update', { balance: result.newBalance });
        const snapshot = await getPortfolioSnapshot(player.name, quotes, fetchMissingPrice);
        socket.emit('stock-portfolio', snapshot);
        recordSnapshot(player.name, snapshot.totalValue, result.newBalance);
        socket.emit('stock-portfolio-history', getHistory(player.name));
    } catch (err) { console.error('stock-sell error:', err.message); } });

    // --- Stock Game: Get Portfolio ---
    socket.on('stock-get-portfolio', async () => { try {
        if (!checkRateLimit(socket)) return;
        if (!_stockGameEnabled) {
            emitStockError(socket, 'GAME_DISABLED', 'Stock game is disabled by server config');
            return;
        }
        const player = onlinePlayers.get(socket.id);
        if (!player) return;

        const quotes = _fetchTickerQuotes ? await _fetchTickerQuotes() : [];
        const snapshot = await getPortfolioSnapshot(player.name, quotes, fetchMissingPrice);
        socket.emit('stock-portfolio', snapshot);
        const cash = await getBalance(player.name);
        recordSnapshot(player.name, snapshot.totalValue, cash);
        socket.emit('stock-portfolio-history', getHistory(player.name));
    } catch (err) { console.error('stock-get-portfolio error:', err.message); } });

    // --- Stock Game: Get Portfolio History ---
    socket.on('stock-get-portfolio-history', async () => { try {
        if (!checkRateLimit(socket)) return;
        if (!_stockGameEnabled) return;
        const player = onlinePlayers.get(socket.id);
        if (!player) return;
        socket.emit('stock-portfolio-history', getHistory(player.name));
    } catch (err) { console.error('stock-get-portfolio-history error:', err.message); } });

    // --- Stock Game: Get All Players' Portfolios (Leaderboard) ---
    socket.on('stock-get-leaderboard', async () => { try {
        if (!checkRateLimit(socket)) return;
        if (!_stockGameEnabled) {
            emitStockError(socket, 'GAME_DISABLED', 'Stock game is disabled by server config');
            return;
        }
        const player = onlinePlayers.get(socket.id);
        if (!player) return;

        const quotes = _fetchTickerQuotes ? await _fetchTickerQuotes() : [];

        // Build name -> character lookup from online players
        const charByName = new Map();
        for (const p of onlinePlayers.values()) {
            if (p.name && p.character) charByName.set(p.name, p.character);
        }

        const leaderboard = await getLeaderboardSnapshot(quotes, fetchMissingPrice);
        for (const entry of leaderboard) {
            const ch = charByName.get(entry.name);
            if (ch) entry.character = ch;
        }
        socket.emit('stock-leaderboard', leaderboard);

        const performanceLeaderboard = await getTradePerformanceLeaderboard(quotes, fetchMissingPrice);
        for (const entry of performanceLeaderboard) {
            const ch = charByName.get(entry.name);
            if (ch) entry.character = ch;
        }
        socket.emit('stock-performance-leaderboard', performanceLeaderboard);
    } catch (err) { console.error('stock-get-leaderboard error:', err.message); } });
}

export function cleanupStockQuoteCache() {
    const now = Date.now();
    for (const [symbol, entry] of stockQuoteCache) {
        if (now - entry.ts > STOCK_QUOTE_CACHE_MS) stockQuoteCache.delete(symbol);
    }
}
