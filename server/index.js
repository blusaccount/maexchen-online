import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

let yahooFinancePromise = null;
async function getYahooFinance() {
    if (!yahooFinancePromise) {
        yahooFinancePromise = import('yahoo-finance2').then(
            m => new m.default({ suppressNotices: ['yahooSurvey'] })
        );
    }
    return yahooFinancePromise;
}

import { rooms, onlinePlayers } from './room-manager.js';
import { registerSocketHandlers } from './socket-handlers.js';
import { startDiscordBot } from './discord-bot.js';
import { initSchema } from './db.js';
import { startMatchChecker, stopMatchChecker } from './lol-match-checker.js';

import { createAuthRouter, authMiddleware } from './routes/auth.js';
import turkishRouter from './routes/turkish.js';
import nostalgiaRouter from './routes/nostalgiabait.js';
import { createStocksRouter } from './routes/stocks.js';
import { startPeriodicCleanup } from './cleanup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const GAME_ENABLED = String(process.env.GAME_ENABLED ?? 'true').toLowerCase() !== 'false';

// Trust proxy (Render terminates SSL at the proxy layer)
app.set('trust proxy', 1);

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

// Auth routes (login must be before auth middleware)
app.use(createAuthRouter());
app.use(authMiddleware);

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

// ============== ROUTE MODULES ==============

const stocksRouter = createStocksRouter({ getYahooFinance, isStockGameEnabled: GAME_ENABLED });
app.use(stocksRouter);
app.use(turkishRouter);
app.use(nostalgiaRouter);

// ============== SOCKET HANDLERS ==============

registerSocketHandlers(io, {
    fetchTickerQuotes: stocksRouter.fetchTickerQuotes,
    getYahooFinance,
    isStockGameEnabled: GAME_ENABLED
});

// ============== PERIODIC CLEANUP ==============

startPeriodicCleanup(io);

// ============== START SERVER ==============

// Initialise database schema before accepting connections
try {
    await initSchema();
} catch (err) {
    console.error('Database schema init error:', err);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
    console.log(`✓ StrictHotel Server: http://localhost:${PORT}`);
    if (!GAME_ENABLED) {
        console.log('⚠ GAME_ENABLED=false: stock game APIs and socket trades are disabled');
    }

    // Start LoL match checker
    try {
        startMatchChecker(io);
    } catch (err) {
        console.error('LoL Match Checker error:', err.message);
    }

    // Discord Bot starten
    try {
        await startDiscordBot(rootDir);
    } catch (err) {
        console.error('Discord Bot Fehler:', err.message);
    }
});

// Graceful shutdown
function gracefulShutdown(signal) {
    console.log(`${signal} received, shutting down gracefully...`);
    stopMatchChecker();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
