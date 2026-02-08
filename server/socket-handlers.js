import {
    ROLL_ORDER, STARTING_LIVES,
    rollRank, rollName, rollDice, isMaexchen,
    getAlivePlayers, nextAlivePlayerIndex
} from './game-logic.js';
import { randomInt } from 'crypto';

import {
    rooms, onlinePlayers, socketToRoom,
    broadcastOnlinePlayers, getOpenLobbies, broadcastLobbies,
    generateRoomCode, getRoom, broadcastRoomState, sendTurnStart,
    removePlayerFromRoom, awardPotAndEndGame
} from './room-manager.js';

import { getBalance, addBalance, deductBalance, buyDiamonds, getDiamonds } from './currency.js';
import { isDatabaseEnabled, query, withTransaction } from './db.js';
import {
    sanitizeName,
    validateCharacter,
    validateRoomCode,
    validateGameType,
    validateYouTubeId,
    normalizePoint,
    sanitizeColor,
    sanitizeSize,
    emitStockError,
    emitBalanceUpdate,
    getSocketIp
} from './socket-utils.js';
import {
    buyStock,
    sellStock,
    getPortfolioSnapshot,
    getAllPortfolioPlayerNames,
    getLeaderboardSnapshot,
    getTradePerformanceLeaderboard
} from './stock-game.js';
import { recordSnapshot, getHistory } from './portfolio-history.js';
import { loadStrokes, saveStroke, deleteStroke, clearStrokes, loadMessages, saveMessage, clearMessages, PICTO_MAX_MESSAGES } from './pictochat-store.js';
import { registerMaexchenHandlers } from './handlers/maexchen.js';
import { registerBrainVersusHandlers, cleanupBrainVersusOnDisconnect } from './handlers/brain-versus.js';
import { registerLolBettingHandlers } from './handlers/lol-betting.js';

// ============== INPUT VALIDATION ==============

function parseTradeAmount(rawAmount) {
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
        return null;
    }
    return amount;
}

// ============== RATE LIMITING ==============

const rateLimiters = new Map(); // socketId -> { count, resetTime }
const rateLimitersIp = new Map(); // ip -> { count, resetTime }
const stockTradeCooldown = new Map(); // socketId -> timestamp
const strictly7sSpinCooldown = new Map(); // socketId -> timestamp

function checkRateLimit(socketOrId, maxPerSecond = 10) {
    const now = Date.now();
    const socketId = typeof socketOrId === 'string' ? socketOrId : socketOrId?.id;
    if (!socketId) return false;

    let entry = rateLimiters.get(socketId);
    if (!entry || now > entry.resetTime) {
        entry = { count: 0, resetTime: now + 1000 };
        rateLimiters.set(socketId, entry);
    }
    entry.count++;
    if (entry.count > maxPerSecond) return false;

    if (typeof socketOrId !== 'string') {
        const ip = getSocketIp(socketOrId);
        let ipEntry = rateLimitersIp.get(ip);
        if (!ipEntry || now > ipEntry.resetTime) {
            ipEntry = { count: 0, resetTime: now + 1000 };
            rateLimitersIp.set(ip, ipEntry);
        }
        ipEntry.count++;
        if (ipEntry.count > maxPerSecond) return false;
    }

    return true;
}

function checkStockTradeCooldown(socketId, minIntervalMs = 400) {
    const now = Date.now();
    const lastTradeAt = stockTradeCooldown.get(socketId) || 0;
    if (now - lastTradeAt < minIntervalMs) return false;
    stockTradeCooldown.set(socketId, now);
    return true;
}

function checkStrictly7sCooldown(socketId, minIntervalMs = 1200) {
    const now = Date.now();
    const lastSpinAt = strictly7sSpinCooldown.get(socketId) || 0;
    if (now - lastSpinAt < minIntervalMs) return false;
    strictly7sSpinCooldown.set(socketId, now);
    return true;
}

// ============== SOUNDBOARD STATE ==============

const SOUNDBOARD_ROOM = 'lobby-soundboard';
const SOUNDBOARD_VALID_IDS = new Set([
    'anatolia', 'elgato', 'fahh', 'massenhausen', 'plug',
    'reverbfart', 'rizz', 'seyuh', 'vineboom'
]);

// ============== STRICT CLUB STATE ==============

const CLUB_ROOM = 'strict-club';
const clubState = {
    videoId: null,
    title: null,
    queuedBy: null,
    isPlaying: false,
    startedAt: null,
    queue: [],              // { videoId, title, queuedBy }
    listeners: new Map() // socketId -> name
};

// ============== LOOP MACHINE STATE ==============

const LOOP_ROOM = 'loop-machine-room';
const LOOP_MIN_BARS = 1;
const LOOP_MAX_BARS = 8;
const LOOP_STEPS_PER_BAR = 4;
const LOOP_DEFAULT_BARS = 4;

function createEmptyLoopRow(bars = LOOP_DEFAULT_BARS) {
    const totalSteps = bars * LOOP_STEPS_PER_BAR;
    return new Array(totalSteps).fill(0);
}

const EMPTY_GRID_ROW = createEmptyLoopRow();
const loopState = {
    grid: {
        kick:    [...EMPTY_GRID_ROW],
        snare:   [...EMPTY_GRID_ROW],
        hihat:   [...EMPTY_GRID_ROW],
        clap:    [...EMPTY_GRID_ROW],
        tom:     [...EMPTY_GRID_ROW],
        ride:    [...EMPTY_GRID_ROW],
        cowbell: [...EMPTY_GRID_ROW],
        bass:    [...EMPTY_GRID_ROW],
        synth:   [...EMPTY_GRID_ROW],
        pluck:   [...EMPTY_GRID_ROW],
        pad:     [...EMPTY_GRID_ROW],
    },
    bpm: 120,
    bars: LOOP_DEFAULT_BARS,
    isPlaying: false,
    currentStep: 0,
    masterVolume: 1.0,
    listeners: new Map(),  // socketId -> playerName
    synth: {
        waveform: 'square',
        frequency: 440,
        cutoff: 2000,
        resonance: 1,
        attack: 0.01,
        decay: 0.2,
        volume: 0.3
    },
    bass: {
        waveform: 'sine',
        frequency: 65.41,
        cutoff: 800,
        resonance: 1,
        attack: 0.01,
        decay: 0.5,
        distortion: 0
    }
};

// ============== STRICTLY7S STATE ==============

const STRICTLY7S_BETS = [2, 5, 10, 15, 20, 50];
const STRICTLY7S_SYMBOLS = [
    { id: 'SEVEN', label: '7', weight: 1, multiplier: 84 },
    { id: 'BAR', label: 'BAR', weight: 2, multiplier: 34 },
    { id: 'DIAMOND', label: 'DIAMOND', weight: 3, multiplier: 25 },
    { id: 'BELL', label: 'BELL', weight: 4, multiplier: 17 },
    { id: 'CHERRY', label: 'CHERRY', weight: 6, multiplier: 13 },
    { id: 'LEMON', label: 'LEMON', weight: 8, multiplier: 8 }
];
const STRICTLY7S_TOTAL_WEIGHT = STRICTLY7S_SYMBOLS.reduce((sum, s) => sum + s.weight, 0);

function pickStrictly7sSymbol() {
    const roll = randomInt(1, STRICTLY7S_TOTAL_WEIGHT + 1);
    let acc = 0;
    for (const symbol of STRICTLY7S_SYMBOLS) {
        acc += symbol.weight;
        if (roll <= acc) return symbol;
    }
    return STRICTLY7S_SYMBOLS[STRICTLY7S_SYMBOLS.length - 1];
}

function evaluateStrictly7sSpin(reels) {
    if (!Array.isArray(reels) || reels.length !== 3) {
        return { multiplier: 0, winType: 'none', symbol: null };
    }

    const [a, b, c] = reels;
    if (a.id === b.id && b.id === c.id) {
        return { multiplier: a.multiplier, winType: 'three-kind', symbol: a.id };
    }

    const cherryCount = reels.filter(r => r.id === 'CHERRY').length;
    if (cherryCount >= 2) {
        return { multiplier: 2, winType: 'two-cherries', symbol: 'CHERRY' };
    }

    return { multiplier: 0, winType: 'none', symbol: null };
}

// ============== PICTOCHAT STATE ==============

const PICTO_ROOM = 'lobby-picto';
const PICTO_MAX_STROKES = 400;
const PICTO_MAX_POINTS = 800;
const PICTO_MAX_POINTS_PER_SEGMENT = 20;

const pictoState = {
    strokes: [],
    inProgress: new Map(), // strokeId -> stroke
    redoStacks: new Map(), // socketId -> stroke[]
    messages: [],          // recent messages for join replay
    hydrated: false,       // whether DB state has been loaded
    hydrationPromise: null
};

function sanitizePoints(points) {
    if (!Array.isArray(points)) return [];
    const clean = [];
    for (const p of points.slice(0, PICTO_MAX_POINTS_PER_SEGMENT)) {
        const norm = normalizePoint(p);
        if (norm) clean.push(norm);
    }
    return clean;
}

function getPictoName(socketId) {
    const entry = onlinePlayers.get(socketId);
    return entry?.name || 'Anon';
}

function getRedoStack(socketId) {
    if (!pictoState.redoStacks.has(socketId)) {
        pictoState.redoStacks.set(socketId, []);
    }
    return pictoState.redoStacks.get(socketId);
}

function trimStrokes() {
    const strokes = pictoState.strokes;
    if (strokes.length > PICTO_MAX_STROKES) {
        strokes.splice(0, strokes.length - PICTO_MAX_STROKES);
    }
}

function cleanupPictoForSocket(socketId, io) {
    pictoState.redoStacks.delete(socketId);
    for (const [strokeId, stroke] of pictoState.inProgress.entries()) {
        if (stroke.authorId === socketId) {
            pictoState.inProgress.delete(strokeId);
            // Commit in-progress strokes so they don't vanish for other clients
            if (stroke.points && stroke.points.length > 0) {
                pictoState.strokes.push(stroke);
                trimStrokes();
                if (io) {
                    io.to(PICTO_ROOM).emit('picto-stroke-commit', {
                        strokeId: stroke.strokeId,
                        authorId: stroke.authorId,
                        tool: stroke.tool,
                        color: stroke.color,
                        size: stroke.size,
                        points: stroke.points
                    });
                }
                saveStroke(stroke).catch(err => {
                    console.error('saveStroke cleanup error:', err.message);
                });
            }
        }
    }
}

// ============== STRICT BRAIN STATE ==============


async function getQuoteForSymbol(symbol, quotes) {
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

export function cleanupRateLimiters() {
    const now = Date.now();
    for (const [id, entry] of rateLimiters) {
        if (now > entry.resetTime) rateLimiters.delete(id);
    }
    for (const [ip, entry] of rateLimitersIp) {
        if (now > entry.resetTime) rateLimitersIp.delete(ip);
    }
    for (const [id, ts] of stockTradeCooldown) {
        if (now - ts > 5 * 60 * 1000) stockTradeCooldown.delete(id);
    }
    for (const [id, ts] of strictly7sSpinCooldown) {
        if (now - ts > 5 * 60 * 1000) strictly7sSpinCooldown.delete(id);
    }
    for (const [symbol, entry] of stockQuoteCache) {
        if (now - entry.ts > STOCK_QUOTE_CACHE_MS) stockQuoteCache.delete(symbol);
    }
}

// ============== SOCKET HANDLERS ==============

// ============== STOCK GAME ==============

let _fetchTickerQuotes = null;
let _getYahooFinance = null;
let _stockGameEnabled = true;
let _io = null;

const stockQuoteCache = new Map(); // symbol -> { quote, ts }
const STOCK_QUOTE_CACHE_MS = 60 * 1000;

export function registerSocketHandlers(io, { fetchTickerQuotes, getYahooFinance, isStockGameEnabled = true } = {}) {
    _fetchTickerQuotes = fetchTickerQuotes || null;
    _getYahooFinance = getYahooFinance || null;
    _stockGameEnabled = isStockGameEnabled !== false;
    _io = io;
    io.on('connection', (socket) => {
        console.log(`Connected: ${socket.id}`);

        // Send current online players to new connection
        socket.emit('online-players', Array.from(onlinePlayers.values()));

        // --- Register Player (when they enter their name) ---
        socket.on('register-player', async (data) => { try {
            if (!checkRateLimit(socket)) return;
            if (!data || typeof data !== 'object') return;

            const name = sanitizeName(data.name);
            if (!name) return;
            const character = validateCharacter(data.character);
            const game = validateGameType(data.game);

            onlinePlayers.set(socket.id, { name, character, game });
            broadcastOnlinePlayers(io);

            // Send currency balance to the player
            socket.emit('balance-update', { balance: await getBalance(name) });

            console.log(`Registered: ${name} for ${game}`);
        } catch (err) { console.error('register-player error:', err.message); } });

        // --- Get Player Diamonds (for contacts list) ---
        socket.on('get-player-diamonds', async (data) => { try {
            if (!checkRateLimit(socket)) return;
            if (!data || typeof data !== 'object') return;
            const name = sanitizeName(data.name);
            if (!name) return;

            const diamonds = await getDiamonds(name);
            socket.emit('player-diamonds', { name, diamonds });
        } catch (err) { console.error('get-player-diamonds error:', err.message); } });

        // --- Get Player Character (for contacts app) ---
        socket.on('get-player-character', async (data) => { try {
            if (!checkRateLimit(socket)) return;
            if (!data || typeof data !== 'object') return;
            const name = sanitizeName(data.name);
            if (!name) return;

            // Find the player by name in onlinePlayers
            let found = null;
            for (const [, p] of onlinePlayers) {
                if (p.name === name) {
                    found = p;
                    break;
                }
            }

            if (found) {
                const diamonds = await getDiamonds(found.name);
                socket.emit('player-character', {
                    name: found.name,
                    character: found.character,
                    game: found.game,
                    diamonds
                });
            }
        } catch (err) { console.error('get-player-character error:', err.message); } });

        // --- Get Currency Balance ---
        socket.on('get-balance', async () => { try {
            if (!checkRateLimit(socket)) return;
            const player = onlinePlayers.get(socket.id);
            if (!player) return;
            socket.emit('balance-update', { balance: await getBalance(player.name) });
        } catch (err) { console.error('get-balance error:', err.message); } });

        // --- Get Player Diamonds ---
        socket.on('get-player-diamonds', async () => { try {
            if (!checkRateLimit(socket)) return;
            const player = onlinePlayers.get(socket.id);
            if (!player || !player.name) return;
            const diamonds = await getDiamonds(player.name);
            socket.emit('diamonds-update', { diamonds });
        } catch (err) { console.error('get-player-diamonds error:', err.message); } });

        // --- Buy Diamonds ---
        socket.on('buy-diamonds', async (data) => { try {
            if (!checkRateLimit(socket)) return;
            const player = onlinePlayers.get(socket.id);
            if (!player || !player.name) return;
            
            const count = Number(data?.count) || 1;
            if (!Number.isInteger(count) || count <= 0 || count > 100) {
                socket.emit('error', { message: 'Ungültige Anzahl' });
                return;
            }
            
            const result = await buyDiamonds(player.name, count);
            if (result === null) {
                socket.emit('error', { message: 'Nicht genug Coins!' });
                return;
            }
            
            socket.emit('balance-update', { balance: result.balance });
            socket.emit('diamonds-update', { diamonds: result.diamonds });
        } catch (err) { console.error('buy-diamonds error:', err.message); } });

        // --- Make It Rain Effect ---
        socket.on('lobby-make-it-rain', async () => { try {
            if (!checkRateLimit(socket)) return;
            const player = onlinePlayers.get(socket.id);
            if (!player || !player.name) return;
            
            const cost = 20;
            const newBalance = await deductBalance(player.name, cost, 'lobby_effect_rain');
            if (newBalance === null) {
                socket.emit('error', { message: 'Nicht genug Coins!' });
                return;
            }
            
            socket.emit('balance-update', { balance: newBalance });
            
            // Broadcast to all connected users (celebration effect visible to everyone)
            // Note: No lobby room exists; this is intentional so all users see the effect
            io.emit('lobby-rain-effect', { playerName: player.name });
        } catch (err) { console.error('lobby-make-it-rain error:', err.message); } });

        // --- Strictly7s Slot Machine ---
        socket.on('strictly7s-spin', async (data) => { try {
            if (!checkRateLimit(socket, 5)) return;
            if (!checkStrictly7sCooldown(socket.id)) {
                socket.emit('strictly7s-error', { message: 'Spin cooldown active. Try again.' });
                return;
            }

            const player = onlinePlayers.get(socket.id);
            if (!player || !player.name) {
                socket.emit('strictly7s-error', { message: 'Not logged in' });
                return;
            }

            const bet = Number(data?.bet);
            if (!Number.isInteger(bet) || !STRICTLY7S_BETS.includes(bet)) {
                socket.emit('strictly7s-error', { message: 'Invalid bet amount' });
                return;
            }

            const balanceAfterBet = await deductBalance(player.name, bet, 'strictly7s_bet', { bet });
            if (balanceAfterBet === null) {
                socket.emit('strictly7s-error', { message: 'Not enough coins' });
                return;
            }

            const reels = [pickStrictly7sSymbol(), pickStrictly7sSymbol(), pickStrictly7sSymbol()];
            const outcome = evaluateStrictly7sSpin(reels);

            let payout = 0;
            let finalBalance = balanceAfterBet;
            if (outcome.multiplier > 0) {
                payout = bet * outcome.multiplier;
                const updated = await addBalance(player.name, payout, 'strictly7s_payout', {
                    bet,
                    payout,
                    winType: outcome.winType,
                    reels: reels.map(r => r.id)
                });
                if (updated !== null) {
                    finalBalance = updated;
                }
            }

            socket.emit('balance-update', { balance: finalBalance });
            socket.emit('strictly7s-spin-result', {
                reels: reels.map(r => r.id),
                bet,
                payout,
                multiplier: outcome.multiplier,
                winType: outcome.winType,
                balance: finalBalance
            });
        } catch (err) {
            console.error('strictly7s-spin error:', err.message);
            socket.emit('strictly7s-error', { message: 'Spin failed. Try again.' });
        } });

        // --- Stock Game: Buy ---
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
            const quote = await getQuoteForSymbol(symbol, quotes);
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
            const snapshot = await getPortfolioSnapshot(player.name, quotes);
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
            const quote = await getQuoteForSymbol(symbol, quotes);
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
            const snapshot = await getPortfolioSnapshot(player.name, quotes);
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
            const snapshot = await getPortfolioSnapshot(player.name, quotes);
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

            const leaderboard = await getLeaderboardSnapshot(quotes);
            for (const entry of leaderboard) {
                const ch = charByName.get(entry.name);
                if (ch) entry.character = ch;
            }
            socket.emit('stock-leaderboard', leaderboard);

            const performanceLeaderboard = await getTradePerformanceLeaderboard(quotes);
            for (const entry of performanceLeaderboard) {
                const ch = charByName.get(entry.name);
                if (ch) entry.character = ch;
            }
            socket.emit('stock-performance-leaderboard', performanceLeaderboard);
        } catch (err) { console.error('stock-get-leaderboard error:', err.message); } });

        // --- Pictochat Join ---
        socket.on('picto-join', async () => { try {
            if (!checkRateLimit(socket)) return;
            socket.join(PICTO_ROOM);

            // On first join (empty in-memory state), hydrate from DB
            if (pictoState.strokes.length === 0 && !pictoState.hydrated && !pictoState.hydrationPromise) {
                pictoState.hydrationPromise = (async () => {
                    const dbStrokes = await loadStrokes();
                    if (dbStrokes.length > 0) {
                        pictoState.strokes = dbStrokes;
                    }
                    const dbMessages = await loadMessages();
                    if (dbMessages.length > 0) {
                        pictoState.messages = dbMessages;
                    }
                    pictoState.hydrated = true;
                })();
            }

            // Wait for any in-flight hydration before sending state
            if (pictoState.hydrationPromise) {
                await pictoState.hydrationPromise;
                pictoState.hydrationPromise = null;
            }

            socket.emit('picto-state', {
                strokes: pictoState.strokes,
                messages: pictoState.messages || []
            });
        } catch (err) { console.error('picto-join error:', err.message); } });

        // --- Pictochat Cursor ---
        socket.on('picto-cursor', (data) => { try {
            if (!checkRateLimit(socket, 40)) return;
            if (!data || typeof data !== 'object') return;
            const point = normalizePoint({ x: data.x, y: data.y });
            if (!point) return;
            socket.to(PICTO_ROOM).emit('picto-cursor', {
                id: socket.id,
                name: getPictoName(socket.id),
                x: point.x,
                y: point.y
            });
        } catch (err) { console.error('picto-cursor error:', err.message); } });

        socket.on('picto-cursor-hide', () => { try {
            if (!checkRateLimit(socket, 20)) return;
            socket.to(PICTO_ROOM).emit('picto-cursor-hide', {
                id: socket.id
            });
        } catch (err) { console.error('picto-cursor-hide error:', err.message); } });

        // --- Pictochat Stroke Segment ---
        socket.on('picto-stroke-segment', (data) => { try {
            if (!checkRateLimit(socket, 30)) return;
            if (!data || typeof data !== 'object') return;

            const tool = data.tool === 'eraser' ? 'eraser' : 'pen';
            const color = sanitizeColor(data.color);
            const size = sanitizeSize(data.size);
            const strokeId = typeof data.strokeId === 'string' && data.strokeId.length < 80
                ? data.strokeId
                : null;
            if (!strokeId) return;

            const points = sanitizePoints(data.points);
            if (!points.length) return;

            let stroke = pictoState.inProgress.get(strokeId);
            if (!stroke) {
                stroke = {
                    strokeId,
                    authorId: socket.id,
                    authorName: getPictoName(socket.id),
                    tool,
                    color,
                    size,
                    points: []
                };
                pictoState.inProgress.set(strokeId, stroke);
            }

            if (stroke.points.length + points.length > PICTO_MAX_POINTS) return;
            stroke.points.push(...points);

            socket.to(PICTO_ROOM).emit('picto-stroke-segment', {
                strokeId,
                tool,
                color,
                size,
                points
            });
        } catch (err) { console.error('picto-stroke-segment error:', err.message); } });

        // --- Pictochat Stroke End ---
        socket.on('picto-stroke-end', async (data) => { try {
            if (!checkRateLimit(socket, 10)) return;
            if (!data || typeof data !== 'object') return;

            const strokeId = typeof data.strokeId === 'string' ? data.strokeId : '';
            const stroke = pictoState.inProgress.get(strokeId);
            if (!stroke || stroke.authorId !== socket.id) return;

            pictoState.inProgress.delete(strokeId);
            pictoState.strokes.push(stroke);
            trimStrokes();

            const redo = getRedoStack(socket.id);
            redo.length = 0;

            io.to(PICTO_ROOM).emit('picto-stroke-commit', {
                strokeId: stroke.strokeId,
                authorId: stroke.authorId,
                tool: stroke.tool,
                color: stroke.color,
                size: stroke.size,
                points: stroke.points
            });

            await saveStroke(stroke);
        } catch (err) { console.error('picto-stroke-end error:', err.message); } });

        // --- Pictochat Shape ---
        socket.on('picto-shape', async (data) => { try {
            if (!checkRateLimit(socket, 8)) return;
            if (!data || typeof data !== 'object') return;

            const tool = ['line', 'rect', 'circle'].includes(data.tool) ? data.tool : null;
            if (!tool) return;

            const start = normalizePoint(data.start);
            const end = normalizePoint(data.end);
            if (!start || !end) return;

            const stroke = {
                strokeId: `${socket.id}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                authorId: socket.id,
                authorName: getPictoName(socket.id),
                tool,
                color: sanitizeColor(data.color),
                size: sanitizeSize(data.size),
                start,
                end
            };

            pictoState.strokes.push(stroke);
            trimStrokes();

            const redo = getRedoStack(socket.id);
            redo.length = 0;

            io.to(PICTO_ROOM).emit('picto-shape', stroke);

            await saveStroke(stroke);
        } catch (err) { console.error('picto-shape error:', err.message); } });

        // --- Pictochat Undo ---
        socket.on('picto-undo', async (data) => { try {
            if (!checkRateLimit(socket, 5)) return;
            if (!data || typeof data !== 'object') return;

            const strokeId = typeof data.strokeId === 'string' ? data.strokeId : '';
            const strokes = pictoState.strokes;
            const index = strokes.findIndex(s => s.strokeId === strokeId && s.authorId === socket.id);
            if (index === -1) return;

            const [removed] = strokes.splice(index, 1);
            getRedoStack(socket.id).push(removed);

            io.to(PICTO_ROOM).emit('picto-undo', {
                strokeId,
                byId: socket.id
            });

            await deleteStroke(strokeId);
        } catch (err) { console.error('picto-undo error:', err.message); } });

        // --- Pictochat Redo ---
        socket.on('picto-redo', async () => { try {
            if (!checkRateLimit(socket, 5)) return;

            const redo = getRedoStack(socket.id);
            if (!redo.length) return;

            const stroke = redo.pop();
            pictoState.strokes.push(stroke);
            trimStrokes();

            io.to(PICTO_ROOM).emit('picto-redo', {
                stroke,
                byId: socket.id
            });

            await saveStroke(stroke);
        } catch (err) { console.error('picto-redo error:', err.message); } });

        // --- Pictochat Clear ---
        socket.on('picto-clear', async () => { try {
            if (!checkRateLimit(socket, 2)) return;

            pictoState.strokes = [];
            getRedoStack(socket.id).length = 0;
            pictoState.inProgress.clear();

            io.to(PICTO_ROOM).emit('picto-clear', {
                byId: socket.id
            });

            await clearStrokes();
        } catch (err) { console.error('picto-clear error:', err.message); } });

        // --- Pictochat Message ---
        socket.on('picto-message', async (text) => { try {
            if (!checkRateLimit(socket, 6)) return;
            if (typeof text !== 'string') return;
            const message = text.replace(/[<>&"'`]/g, '').slice(0, 200).trim();
            if (!message) return;

            const payload = {
                name: getPictoName(socket.id),
                text: message,
                timestamp: Date.now()
            };

            pictoState.messages.push(payload);
            // Keep in-memory message list bounded
            if (pictoState.messages.length > PICTO_MAX_MESSAGES) {
                pictoState.messages.splice(0, pictoState.messages.length - PICTO_MAX_MESSAGES);
            }

            io.to(PICTO_ROOM).emit('picto-message', payload);

            await saveMessage(payload.name, payload.text);
        } catch (err) { console.error('picto-message error:', err.message); } });

        // ============== SOUNDBOARD HANDLERS ==============

        socket.on('soundboard-join', () => { try {
            if (!checkRateLimit(socket)) return;
            socket.join(SOUNDBOARD_ROOM);
        } catch (err) { console.error('soundboard-join error:', err.message); } });

        socket.on('soundboard-play', (soundId) => { try {
            if (!checkRateLimit(socket, 3)) return;
            if (typeof soundId !== 'string') return;
            if (!SOUNDBOARD_VALID_IDS.has(soundId)) return;

            io.to(SOUNDBOARD_ROOM).emit('soundboard-played', {
                soundId,
                playerName: getPictoName(socket.id),
                timestamp: Date.now()
            });
        } catch (err) { console.error('soundboard-play error:', err.message); } });

        // --- Request Lobbies ---
        socket.on('get-lobbies', (gameType) => { try {
            if (!checkRateLimit(socket)) return;
            const gt = validateGameType(gameType);
            const lobbies = getOpenLobbies(gt);
            socket.emit('lobbies-update', { gameType: gt, lobbies });
        } catch (err) { console.error('get-lobbies error:', err.message); } });

        // --- Create Room ---
        socket.on('create-room', (data) => { try {
            if (!checkRateLimit(socket)) return;

            // Support both old (string) and new (object) format
            const playerName = sanitizeName(typeof data === 'string' ? data : data?.playerName);
            const character = validateCharacter(typeof data === 'object' ? data.character : null);
            const gameType = validateGameType(typeof data === 'object' ? data.gameType : 'maexchen');

            if (!playerName) {
                socket.emit('error', { message: 'Name ungültig!' });
                return;
            }

            // Prevent one socket from creating too many rooms
            const existingRoom = getRoom(socket.id);
            if (existingRoom) {
                socket.emit('error', { message: 'Du bist bereits in einem Raum!' });
                return;
            }

            const code = generateRoomCode();
            const room = {
                code,
                hostId: socket.id,
                gameType: gameType,
                players: [{
                    socketId: socket.id,
                    name: playerName,
                    character: character
                }],
                game: null
            };
            rooms.set(code, room);
            socketToRoom.set(socket.id, code);
            socket.join(code);

            socket.emit('room-created', { code });
            broadcastRoomState(io, room);
            broadcastLobbies(io, gameType);
            console.log(`Room ${code} created by ${playerName}`);
        } catch (err) { console.error('create-room error:', err.message); socket.emit('error', { message: 'Fehler beim Erstellen.' }); } });

        // --- Join Room ---
        socket.on('join-room', (data) => { try {
            if (!checkRateLimit(socket)) return;
            if (!data || typeof data !== 'object') return;

            const code = validateRoomCode((data.code || '').toUpperCase());
            const playerName = sanitizeName(data.playerName);
            const character = validateCharacter(data.character);

            if (!playerName) {
                socket.emit('error', { message: 'Name ungültig!' });
                return;
            }
            if (code.length !== 4) {
                socket.emit('error', { message: 'Ungültiger Raum-Code!' });
                return;
            }

            const room = rooms.get(code);

            if (!room) {
                socket.emit('error', { message: 'Raum nicht gefunden!' });
                return;
            }
            if (room.game && room.gameType !== 'watchparty') {
                socket.emit('error', { message: 'Spiel läuft bereits!' });
                return;
            }
            if (room.players.length >= 6) {
                socket.emit('error', { message: 'Raum ist voll (max. 6 Spieler)!' });
                return;
            }
            if (room.players.some(p => p.socketId === socket.id)) {
                socket.emit('error', { message: 'Du bist bereits in diesem Raum!' });
                return;
            }

            room.players.push({
                socketId: socket.id,
                name: playerName,
                character: character
            });
            socketToRoom.set(socket.id, code);
            socket.join(code);

            // For watch party: add late joiner to game state if game already started
            if (room.game && room.gameType === 'watchparty') {
                room.game.players.push({
                    socketId: socket.id,
                    name: playerName,
                    lives: 0,
                    character: character
                });
                // Send game-started so the joiner transitions to game screen
                socket.emit('room-joined', { code });
                socket.emit('game-started', {
                    players: room.game.players.map(p => ({ name: p.name, lives: p.lives, character: p.character }))
                });
            } else {
                socket.emit('room-joined', { code });
            }
            broadcastRoomState(io, room);
            broadcastLobbies(io, room.gameType);
            console.log(`${playerName} joined room ${code}`);
        } catch (err) { console.error('join-room error:', err.message); socket.emit('error', { message: 'Fehler beim Beitreten.' }); } });

        // Register Mäxchen handlers
        registerMaexchenHandlers(socket, io, { checkRateLimit, broadcastLobbies });

        // --- Emote ---
        socket.on('emote', (emoteId) => { try {
            if (!checkRateLimit(socket, 5)) return; // Stricter limit for emotes
            if (typeof emoteId !== 'string' || emoteId.length > 50) return;

            const room = getRoom(socket.id);
            if (!room) return;

            const player = room.players.find(p => p.socketId === socket.id);
            if (!player) return;

            io.to(room.code).emit('emote-broadcast', {
                playerName: player.name,
                emoteId: emoteId
            });
        } catch (err) { console.error('emote error:', err.message); } });

        // --- Chat Message ---
        socket.on('chat-message', (text) => { try {
            if (!checkRateLimit(socket, 5)) return; // Stricter limit for chat
            if (typeof text !== 'string') return;

            const room = getRoom(socket.id);
            if (!room) return;

            const player = room.players.find(p => p.socketId === socket.id);
            if (!player) return;

            const sanitizedText = text.replace(/[<>&"'`]/g, '').slice(0, 100).trim();
            if (!sanitizedText) return;

            io.to(room.code).emit('chat-broadcast', {
                playerName: player.name,
                text: sanitizedText,
                timestamp: Date.now()
            });

            console.log(`[Chat ${room.code}] ${player.name}: ${sanitizedText}`);
        } catch (err) { console.error('chat-message error:', err.message); } });

        // --- Drawing Note ---
        socket.on('drawing-note', (data) => { try {
            if (!checkRateLimit(socket, 3)) return; // Stricter limit for drawings
            if (!data || typeof data !== 'object') return;

            const { dataURL, target } = data;

            const room = getRoom(socket.id);
            if (!room) return;

            const player = room.players.find(p => p.socketId === socket.id);
            if (!player) return;

            if (!dataURL || typeof dataURL !== 'string' || !dataURL.startsWith('data:image/')) return;
            if (dataURL.length > 70000) return;
            if (typeof target !== 'string' || target.length > 20) return;

            if (target === 'all') {
                socket.to(room.code).emit('drawing-note', {
                    from: player.name,
                    dataURL: dataURL,
                    target: 'all'
                });
            } else {
                const targetPlayer = room.players.find(p => p.name === target);
                if (targetPlayer && targetPlayer.socketId !== socket.id) {
                    io.to(targetPlayer.socketId).emit('drawing-note', {
                        from: player.name,
                        dataURL: dataURL,
                        target: targetPlayer.name
                    });
                }
            }

            console.log(`[Drawing ${room.code}] ${player.name} -> ${target}`);
        } catch (err) { console.error('drawing-note error:', err.message); } });

        // --- Watch Party: Load Video ---
        socket.on('watchparty-load', (videoId) => { try {
            if (!checkRateLimit(socket, 5)) return;
            const id = validateYouTubeId(videoId);
            if (!id) return;

            const room = getRoom(socket.id);
            if (!room || room.gameType !== 'watchparty') return;

            room.watchparty = room.watchparty || {};
            room.watchparty.videoId = id;
            room.watchparty.state = 'paused';
            room.watchparty.time = 0;
            room.watchparty.updatedAt = Date.now();

            io.to(room.code).emit('watchparty-video', {
                videoId: id,
                state: 'paused',
                time: 0
            });

            const player = room.players.find(p => p.socketId === socket.id);
            const playerName = player ? player.name : 'Unknown';
            console.log(`[WatchParty ${room.code}] Video loaded by ${playerName}: ${id}`);
        } catch (err) { console.error('watchparty-load error:', err.message); } });

        // --- Watch Party: Play/Pause (any user) ---
        socket.on('watchparty-playpause', (data) => { try {
            if (!checkRateLimit(socket, 5)) return;
            if (!data || typeof data !== 'object') return;

            const room = getRoom(socket.id);
            if (!room || room.gameType !== 'watchparty') return;
            if (!room.watchparty || !room.watchparty.videoId) return;

            const state = data.state === 'playing' ? 'playing' : 'paused';
            const time = typeof data.time === 'number' && isFinite(data.time) ? Math.max(0, data.time) : 0;

            room.watchparty.state = state;
            room.watchparty.time = time;
            room.watchparty.updatedAt = Date.now();

            socket.to(room.code).emit('watchparty-sync', {
                state,
                time,
                updatedAt: room.watchparty.updatedAt
            });

            const player = room.players.find(p => p.socketId === socket.id);
            const playerName = player ? player.name : 'Unknown';
            console.log(`[WatchParty ${room.code}] ${playerName}: ${state} at ${time.toFixed(1)}s`);
        } catch (err) { console.error('watchparty-playpause error:', err.message); } });

        // --- Watch Party: Seek (any user) ---
        socket.on('watchparty-seek', (time) => { try {
            if (!checkRateLimit(socket, 5)) return;
            if (typeof time !== 'number' || !isFinite(time)) return;

            const room = getRoom(socket.id);
            if (!room || room.gameType !== 'watchparty') return;
            if (!room.watchparty || !room.watchparty.videoId) return;

            room.watchparty.time = Math.max(0, time);
            room.watchparty.updatedAt = Date.now();

            socket.to(room.code).emit('watchparty-sync', {
                state: room.watchparty.state,
                time: room.watchparty.time,
                updatedAt: room.watchparty.updatedAt
            });

            console.log(`[WatchParty ${room.code}] Seek to ${time.toFixed(1)}s`);
        } catch (err) { console.error('watchparty-seek error:', err.message); } });

        // --- Watch Party: Request Sync (for newly joined players) ---
        socket.on('watchparty-request-sync', () => { try {
            if (!checkRateLimit(socket)) return;

            const room = getRoom(socket.id);
            if (!room || room.gameType !== 'watchparty') return;
            if (!room.watchparty || !room.watchparty.videoId) return;

            socket.emit('watchparty-video', {
                videoId: room.watchparty.videoId,
                state: room.watchparty.state,
                time: room.watchparty.time
            });
        } catch (err) { console.error('watchparty-request-sync error:', err.message); } });

        // ============== STRICT BRAIN HANDLERS ==============

        registerBrainVersusHandlers(socket, io, {
            checkRateLimit,
            sanitizeName,
            validateRoomCode
        });

        // ============== LOL BETTING ==============

        registerLolBettingHandlers(socket, io, {
            checkRateLimit,
            onlinePlayers
        });

        // ============== END LOL BETTING ==============

        // ============== STRICT CLUB HANDLERS ==============

        socket.on('club-join', () => { try {
            if (!checkRateLimit(socket, 5)) return;

            const player = onlinePlayers.get(socket.id);
            const playerName = player?.name || 'Guest';

            socket.join(CLUB_ROOM);
            clubState.listeners.set(socket.id, playerName);

            // Send current state to the joining user
            socket.emit('club-sync', {
                videoId: clubState.videoId,
                title: clubState.title,
                queuedBy: clubState.queuedBy,
                isPlaying: clubState.isPlaying,
                queue: clubState.queue,
                listeners: Array.from(clubState.listeners.values())
            });

            // Broadcast updated listener list to all
            io.to(CLUB_ROOM).emit('club-listeners', {
                listeners: Array.from(clubState.listeners.values())
            });

            console.log(`[StrictClub] ${playerName} joined (${clubState.listeners.size} listeners)`);
        } catch (err) { console.error('club-join error:', err.message); } });

        socket.on('club-leave', () => { try {
            if (!checkRateLimit(socket, 5)) return;

            const playerName = clubState.listeners.get(socket.id) || 'Guest';
            socket.leave(CLUB_ROOM);
            clubState.listeners.delete(socket.id);

            // Broadcast updated listener list
            io.to(CLUB_ROOM).emit('club-listeners', {
                listeners: Array.from(clubState.listeners.values())
            });

            console.log(`[StrictClub] ${playerName} left (${clubState.listeners.size} listeners)`);
        } catch (err) { console.error('club-leave error:', err.message); } });

        socket.on('club-queue', (videoId) => { try {
            if (!checkRateLimit(socket, 3)) return;

            const id = validateYouTubeId(videoId);
            if (!id) return;

            const player = onlinePlayers.get(socket.id);
            const playerName = player?.name || 'Guest';

            const entry = { videoId: id, title: 'YouTube Track', queuedBy: playerName };

            if (!clubState.videoId) {
                // Nothing playing — start immediately
                clubState.videoId = entry.videoId;
                clubState.title = entry.title;
                clubState.queuedBy = entry.queuedBy;
                clubState.isPlaying = true;
                clubState.startedAt = Date.now();

                io.to(CLUB_ROOM).emit('club-play', {
                    videoId: entry.videoId,
                    title: entry.title,
                    queuedBy: entry.queuedBy
                });
            } else {
                // Something is playing — add to queue (max 20 entries)
                if (clubState.queue.length < 20) {
                    clubState.queue.push(entry);
                }
            }

            // Broadcast updated queue to all listeners
            io.to(CLUB_ROOM).emit('club-queue-update', {
                queue: clubState.queue
            });

            console.log(`[StrictClub] ${playerName} queued: ${id}`);
        } catch (err) { console.error('club-queue error:', err.message); } });

        socket.on('club-pause', (shouldPlay) => { try {
            if (!checkRateLimit(socket, 5)) return;
            if (!clubState.videoId) return;

            clubState.isPlaying = !!shouldPlay;

            const player = onlinePlayers.get(socket.id);
            const playerName = player?.name || 'Guest';

            // Broadcast to all listeners
            io.to(CLUB_ROOM).emit('club-pause', {
                isPlaying: clubState.isPlaying
            });

            console.log(`[StrictClub] ${playerName} ${clubState.isPlaying ? 'resumed' : 'paused'}`);
        } catch (err) { console.error('club-pause error:', err.message); } });

        socket.on('club-skip', () => { try {
            if (!checkRateLimit(socket, 3)) return;

            const player = onlinePlayers.get(socket.id);
            const playerName = player?.name || 'Guest';

            // Play next from queue or clear
            const next = clubState.queue.shift();
            if (next) {
                clubState.videoId = next.videoId;
                clubState.title = next.title;
                clubState.queuedBy = next.queuedBy;
                clubState.isPlaying = true;
                clubState.startedAt = Date.now();

                io.to(CLUB_ROOM).emit('club-play', {
                    videoId: next.videoId,
                    title: next.title,
                    queuedBy: next.queuedBy
                });
            } else {
                clubState.videoId = null;
                clubState.title = null;
                clubState.queuedBy = null;
                clubState.isPlaying = false;
                clubState.startedAt = null;
            }

            // Broadcast updated state and queue to all
            io.to(CLUB_ROOM).emit('club-sync', {
                videoId: clubState.videoId,
                title: clubState.title,
                queuedBy: clubState.queuedBy,
                isPlaying: clubState.isPlaying,
                queue: clubState.queue,
                listeners: Array.from(clubState.listeners.values())
            });

            io.to(CLUB_ROOM).emit('club-queue-update', {
                queue: clubState.queue
            });

            console.log(`[StrictClub] ${playerName} skipped track`);
        } catch (err) { console.error('club-skip error:', err.message); } });

        // ============== END STRICT CLUB ==============

        // ============== LOOP MACHINE HANDLERS ==============

        socket.on('loop-join', () => { try {
            if (!checkRateLimit(socket, 5)) return;

            const player = onlinePlayers.get(socket.id);
            const playerName = player?.name || 'Guest';

            socket.join(LOOP_ROOM);
            loopState.listeners.set(socket.id, playerName);

            // Send current state to the joining user
            socket.emit('loop-sync', {
                grid: loopState.grid,
                bpm: loopState.bpm,
                bars: loopState.bars,
                isPlaying: loopState.isPlaying,
                listeners: Array.from(loopState.listeners.values()),
                synth: loopState.synth,
                bass: loopState.bass,
                masterVolume: loopState.masterVolume
            });

            // Broadcast updated listener list to all
            io.to(LOOP_ROOM).emit('loop-listeners', {
                listeners: Array.from(loopState.listeners.values())
            });

            console.log(`[LoopMachine] ${playerName} joined (${loopState.listeners.size} listeners)`);
        } catch (err) { console.error('loop-join error:', err.message); } });

        socket.on('loop-leave', () => { try {
            if (!checkRateLimit(socket, 5)) return;

            const playerName = loopState.listeners.get(socket.id) || 'Guest';
            socket.leave(LOOP_ROOM);
            loopState.listeners.delete(socket.id);

            // Broadcast updated listener list
            io.to(LOOP_ROOM).emit('loop-listeners', {
                listeners: Array.from(loopState.listeners.values())
            });

            console.log(`[LoopMachine] ${playerName} left (${loopState.listeners.size} listeners)`);
        } catch (err) { console.error('loop-leave error:', err.message); } });

        socket.on('loop-toggle-cell', (data) => { try {
            if (!checkRateLimit(socket, 20)) return;

            const { instrument, step } = data;

            // Validate instrument
            const validInstruments = ['kick', 'snare', 'hihat', 'clap', 'tom', 'ride', 'cowbell', 'bass', 'synth', 'pluck', 'pad'];
            if (!validInstruments.includes(instrument)) return;

            // Validate step
            const stepNum = Number(step);
            const maxStep = (loopState.bars * LOOP_STEPS_PER_BAR) - 1;
            if (!Number.isInteger(stepNum) || stepNum < 0 || stepNum > maxStep) return;

            // Toggle the cell
            loopState.grid[instrument][stepNum] = loopState.grid[instrument][stepNum] === 1 ? 0 : 1;

            // Broadcast to all listeners
            io.to(LOOP_ROOM).emit('loop-cell-updated', {
                instrument,
                step: stepNum,
                value: loopState.grid[instrument][stepNum]
            });

            console.log(`[LoopMachine] Cell toggled: ${instrument}[${stepNum}] = ${loopState.grid[instrument][stepNum]}`);
        } catch (err) { console.error('loop-toggle-cell error:', err.message); } });

        socket.on('loop-set-bpm', (data) => { try {
            if (!checkRateLimit(socket, 5)) return;

            const bpm = Number(data.bpm);
            if (!Number.isInteger(bpm) || bpm < 60 || bpm > 200) return;

            loopState.bpm = bpm;

            // Broadcast to all listeners
            io.to(LOOP_ROOM).emit('loop-bpm-updated', {
                bpm: loopState.bpm
            });

            console.log(`[LoopMachine] BPM set to ${loopState.bpm}`);
        } catch (err) { console.error('loop-set-bpm error:', err.message); } });

        socket.on('loop-set-bars', (data) => { try {
            if (!checkRateLimit(socket, 5)) return;

            const bars = Number(data?.bars);
            if (!Number.isInteger(bars) || bars < LOOP_MIN_BARS || bars > LOOP_MAX_BARS) return;
            if (bars === loopState.bars) return;

            const nextSteps = bars * LOOP_STEPS_PER_BAR;
            for (const instrument in loopState.grid) {
                const currentRow = loopState.grid[instrument] || [];
                if (currentRow.length > nextSteps) {
                    loopState.grid[instrument] = currentRow.slice(0, nextSteps);
                } else if (currentRow.length < nextSteps) {
                    loopState.grid[instrument] = [...currentRow, ...new Array(nextSteps - currentRow.length).fill(0)];
                }
            }

            loopState.bars = bars;
            loopState.currentStep = loopState.currentStep % nextSteps;

            io.to(LOOP_ROOM).emit('loop-sync', {
                grid: loopState.grid,
                bpm: loopState.bpm,
                bars: loopState.bars,
                isPlaying: loopState.isPlaying,
                listeners: Array.from(loopState.listeners.values()),
                synth: loopState.synth,
                bass: loopState.bass,
                masterVolume: loopState.masterVolume
            });

            console.log(`[LoopMachine] Bars set to ${loopState.bars}`);
        } catch (err) { console.error('loop-set-bars error:', err.message); } });

        socket.on('loop-play-pause', () => { try {
            if (!checkRateLimit(socket, 5)) return;

            loopState.isPlaying = !loopState.isPlaying;

            // Broadcast to all listeners
            io.to(LOOP_ROOM).emit('loop-state-updated', {
                isPlaying: loopState.isPlaying
            });

            console.log(`[LoopMachine] ${loopState.isPlaying ? 'Playing' : 'Paused'}`);
        } catch (err) { console.error('loop-play-pause error:', err.message); } });

        socket.on('loop-set-synth', (data) => { try {
            if (!checkRateLimit(socket, 5)) return;
            if (!data || typeof data !== 'object') return;

            // Validate and clamp all values
            const validWaveforms = ['sine', 'square', 'sawtooth', 'triangle'];
            const waveform = validWaveforms.includes(data.waveform) ? data.waveform : 'square';
            
            const frequency = typeof data.frequency === 'number' 
                ? Math.max(50, Math.min(2000, data.frequency))
                : 440;
            
            const cutoff = typeof data.cutoff === 'number'
                ? Math.max(200, Math.min(8000, data.cutoff))
                : 2000;
            
            const resonance = typeof data.resonance === 'number'
                ? Math.max(0.1, Math.min(20, data.resonance))
                : 1;
            
            const attack = typeof data.attack === 'number'
                ? Math.max(0.01, Math.min(0.5, data.attack))
                : 0.01;
            
            const decay = typeof data.decay === 'number'
                ? Math.max(0.05, Math.min(1.0, data.decay))
                : 0.2;
            
            const volume = typeof data.volume === 'number'
                ? Math.max(0, Math.min(1, data.volume))
                : 0.3;

            // Update state
            loopState.synth = {
                waveform,
                frequency,
                cutoff,
                resonance,
                attack,
                decay,
                volume
            };

            // Broadcast to all listeners
            io.to(LOOP_ROOM).emit('loop-synth-updated', loopState.synth);

            console.log(`[LoopMachine] Synth settings updated: ${waveform} @ ${frequency}Hz`);
        } catch (err) { console.error('loop-set-synth error:', err.message); } });

        socket.on('loop-set-master-volume', (data) => { try {
            if (!checkRateLimit(socket, 5)) return;

            const volume = typeof data.masterVolume === 'number'
                ? Math.max(0, Math.min(1, data.masterVolume))
                : 1.0;

            loopState.masterVolume = volume;

            // Broadcast to all listeners
            io.to(LOOP_ROOM).emit('loop-master-volume-updated', {
                masterVolume: loopState.masterVolume
            });

            console.log(`[LoopMachine] Master volume set to ${Math.round(loopState.masterVolume * 100)}%`);
        } catch (err) { console.error('loop-set-master-volume error:', err.message); } });

        socket.on('loop-set-bass', (data) => { try {
            if (!checkRateLimit(socket, 5)) return;
            if (!data || typeof data !== 'object') return;

            // Validate and clamp all values
            const validWaveforms = ['sine', 'square', 'sawtooth', 'triangle'];
            const waveform = validWaveforms.includes(data.waveform) ? data.waveform : 'sine';
            
            const frequency = typeof data.frequency === 'number' 
                ? Math.max(30, Math.min(200, data.frequency))
                : 65.41;
            
            const cutoff = typeof data.cutoff === 'number'
                ? Math.max(100, Math.min(2000, data.cutoff))
                : 800;
            
            const resonance = typeof data.resonance === 'number'
                ? Math.max(0.1, Math.min(20, data.resonance))
                : 1;
            
            const attack = typeof data.attack === 'number'
                ? Math.max(0.01, Math.min(0.5, data.attack))
                : 0.01;
            
            const decay = typeof data.decay === 'number'
                ? Math.max(0.1, Math.min(2.0, data.decay))
                : 0.5;
            
            const distortion = typeof data.distortion === 'number'
                ? Math.max(0, Math.min(1, data.distortion))
                : 0;

            // Update state
            loopState.bass = {
                waveform,
                frequency,
                cutoff,
                resonance,
                attack,
                decay,
                distortion
            };

            // Broadcast to all listeners
            io.to(LOOP_ROOM).emit('loop-bass-updated', loopState.bass);

            console.log(`[LoopMachine] Bass settings updated: ${waveform} @ ${frequency.toFixed(2)}Hz`);
        } catch (err) { console.error('loop-set-bass error:', err.message); } });

        socket.on('loop-clear', () => { try {
            if (!checkRateLimit(socket, 3)) return;

            // Reset all grid cells to 0
            for (const instrument in loopState.grid) {
                loopState.grid[instrument] = createEmptyLoopRow(loopState.bars);
            }

            // Reset synth to defaults
            loopState.synth = {
                waveform: 'square',
                frequency: 440,
                cutoff: 2000,
                resonance: 1,
                attack: 0.01,
                decay: 0.2,
                volume: 0.3
            };

            // Reset bass to defaults
            loopState.bass = {
                waveform: 'sine',
                frequency: 65.41,
                cutoff: 800,
                resonance: 1,
                attack: 0.01,
                decay: 0.5,
                distortion: 0
            };

            // Broadcast full sync to all listeners
            io.to(LOOP_ROOM).emit('loop-sync', {
                grid: loopState.grid,
                bpm: loopState.bpm,
                bars: loopState.bars,
                isPlaying: loopState.isPlaying,
                listeners: Array.from(loopState.listeners.values()),
                synth: loopState.synth,
                bass: loopState.bass,
                masterVolume: loopState.masterVolume
            });

            console.log('[LoopMachine] Grid cleared');
        } catch (err) { console.error('loop-clear error:', err.message); } });

        // ============== END LOOP MACHINE ==============

        // --- Leave Room ---
        socket.on('leave-room', async () => { try {
            if (!checkRateLimit(socket)) return;
            const room = getRoom(socket.id);
            if (!room) return;

            socket.leave(room.code);
            await removePlayerFromRoom(io, socket.id, room);
        } catch (err) { console.error('leave-room error:', err.message); } });

        // --- Disconnect ---
        socket.on('disconnect', async () => { try {
            // Cleanup rate limiter
            rateLimiters.delete(socket.id);
            stockTradeCooldown.delete(socket.id);
            strictly7sSpinCooldown.delete(socket.id);

            cleanupPictoForSocket(socket.id, io);
            io.to(PICTO_ROOM).emit('picto-cursor-hide', { id: socket.id });

            // Cleanup Strict Club
            if (clubState.listeners.has(socket.id)) {
                clubState.listeners.delete(socket.id);
                io.to(CLUB_ROOM).emit('club-listeners', {
                    listeners: Array.from(clubState.listeners.values())
                });
            }

            // Cleanup Loop Machine
            if (loopState.listeners.has(socket.id)) {
                loopState.listeners.delete(socket.id);
                io.to(LOOP_ROOM).emit('loop-listeners', {
                    listeners: Array.from(loopState.listeners.values())
                });
            }

            // Remove from online players
            onlinePlayers.delete(socket.id);
            broadcastOnlinePlayers(io);

            const room = getRoom(socket.id);
            if (room) {
                // Brain Versus: handle forfeit before generic cleanup
                await cleanupBrainVersusOnDisconnect(socket, room, io);
                await removePlayerFromRoom(io, socket.id, room);
                if (room.gameType === 'strictbrain') {
                    broadcastLobbies(io, 'strictbrain');
                }
            }
        } catch (err) { console.error('disconnect error:', err.message); } });
    });
}
