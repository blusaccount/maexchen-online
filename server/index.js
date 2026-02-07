import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

import { rooms, onlinePlayers, socketToRoom, broadcastOnlinePlayers, broadcastLobbies } from './room-manager.js';
import { registerSocketHandlers, cleanupRateLimiters } from './socket-handlers.js';
import { getDailyLesson, buildQuiz } from './turkish-lessons.js';
import { startDiscordBot } from './discord-bot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Trust proxy (Render terminates SSL at the proxy layer)
app.set('trust proxy', 1);

// Password protection (case-insensitive comparison)
const PASSWORD = (process.env.SITE_PASSWORD || 'ADMIN').toLowerCase();

// Session secret validation
if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
    console.error('ERROR: SESSION_SECRET environment variable is required in production');
    process.exit(1);
}

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'strict-hotel-dev-secret-' + Math.random(),
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    }
}));

// Body parser for login
app.use(express.json());

// Login route (must be before auth middleware)
app.post('/login', (req, res) => {
    const { password } = req.body;
    if (password && password.toLowerCase() === PASSWORD) {
        req.session.authenticated = true;
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: 'Incorrect password' });
    }
});

// Auth middleware - protect all routes except login
app.use((req, res, next) => {
    // Allow access to login page, health check, and static assets needed for login
    if (req.path === '/login.html' || 
        req.path === '/health' ||
        req.path.startsWith('/shared/css/') ||
        req.path.startsWith('/shared/fonts/')) {
        return next();
    }

    // Check if user is authenticated
    if (req.session.authenticated) {
        return next();
    }

    // Redirect to login page
    res.redirect('/login.html');
});

// Static files
app.use(express.static(path.join(rootDir, 'public')));
app.use('/shared', express.static(path.join(rootDir, 'shared')));
app.use('/games', express.static(path.join(rootDir, 'games')));
app.use('/userinput', express.static(path.join(rootDir, 'userinput')));

// ============== HEALTH CHECK ==============

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        players: onlinePlayers.size,
        rooms: rooms.size
    });
});

// ============== STOCK TICKER API ==============

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
            const quotes = await yahooFinance.quote(symbols);

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

app.get('/api/ticker', async (req, res) => {
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

// ============== STOCK SEARCH API ==============

const searchCache = new Map();
const SEARCH_CACHE_MS = 10 * 60 * 1000; // 10 minutes

app.get('/api/stock-search', async (req, res) => {
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

        const results = await yahooFinance.search(sanitised, { quotesCount: 8, newsCount: 0 });
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

// ============== SINGLE STOCK QUOTE API ==============

const singleQuoteCache = new Map();
const SINGLE_QUOTE_CACHE_MS = 2 * 60 * 1000; // 2 minutes

app.get('/api/stock-quote', async (req, res) => {
    try {
        const symbol = (req.query.symbol || '').trim().toUpperCase().replace(/[^A-Z0-9.\-^]/g, '');
        if (!symbol || symbol.length > 12) {
            return res.status(400).json({ error: 'Invalid symbol' });
        }

        const cached = singleQuoteCache.get(symbol);
        if (cached && Date.now() - cached.ts < SINGLE_QUOTE_CACHE_MS) {
            return res.json(cached.data);
        }

        const q = await yahooFinance.quote(symbol);
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

// ============== TURKISH DAILY LESSON API ==============

app.get('/api/turkish/daily', (req, res) => {
    try {
        const lesson = getDailyLesson();
        const quiz = buildQuiz(lesson);
        res.json({ id: lesson.id, topic: lesson.topic, words: lesson.words, quiz });
    } catch (err) {
        console.error('[TurkishDaily] Error:', err.message);
        res.status(500).json({
            error: 'turkish_daily_failed',
            message: 'Daily lesson could not be generated.',
        });
    }
});

// ============== NOSTALGIABAIT CONFIG ==============

const NOSTALGIA_VIDEOS = {
    ps1: process.env.NOSTALGIA_PS1_YOUTUBE_ID || '',
    ps2: process.env.NOSTALGIA_PS2_YOUTUBE_ID || '',
    gamecube: process.env.NOSTALGIA_GAMECUBE_YOUTUBE_ID || '',
    wiissbb: process.env.NOSTALGIA_WIISSBB_YOUTUBE_ID || '',
};

app.get('/api/nostalgia-config', (req, res) => {
    res.json(NOSTALGIA_VIDEOS);
});

// ============== SOCKET HANDLERS ==============

registerSocketHandlers(io, { fetchTickerQuotes: fetchTickerQuotes, yahooFinance: yahooFinance });

// ============== PERIODIC CLEANUP ==============

// Every 5 minutes: remove orphaned entries where socket is no longer connected
setInterval(() => {
    const connectedIds = new Set();
    for (const [id] of io.sockets.sockets) {
        connectedIds.add(id);
    }

    // Cleanup onlinePlayers
    let removedPlayers = 0;
    for (const [socketId] of onlinePlayers) {
        if (!connectedIds.has(socketId)) {
            onlinePlayers.delete(socketId);
            removedPlayers++;
        }
    }

    // Cleanup socketToRoom lookup
    for (const [socketId] of socketToRoom) {
        if (!connectedIds.has(socketId)) socketToRoom.delete(socketId);
    }

    // Cleanup rooms with disconnected players
    let removedRooms = 0;
    for (const [code, room] of rooms) {
        room.players = room.players.filter(p => connectedIds.has(p.socketId));
        if (room.players.length === 0) {
            rooms.delete(code);
            removedRooms++;
        } else if (!connectedIds.has(room.hostId)) {
            room.hostId = room.players[0].socketId;
        }
    }

    // Cleanup rate limiters
    cleanupRateLimiters();

    if (removedPlayers > 0 || removedRooms > 0) {
        console.log(`[Cleanup] Removed ${removedPlayers} orphaned players, ${removedRooms} empty rooms`);
        if (removedPlayers > 0) broadcastOnlinePlayers(io);
    }
}, 5 * 60 * 1000);

// ============== START SERVER ==============

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
    console.log(`✓ StrictHotel Server: http://localhost:${PORT}`);

    // Discord Bot starten
    try {
        await startDiscordBot(rootDir);
    } catch (err) {
        console.error('Discord Bot Fehler:', err.message);
    }
});
