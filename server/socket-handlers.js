import {
    ROLL_ORDER, STARTING_LIVES,
    rollRank, rollName, rollDice, isMaexchen,
    getAlivePlayers, nextAlivePlayerIndex
} from './game-logic.js';

import {
    rooms, onlinePlayers, socketToRoom,
    broadcastOnlinePlayers, getOpenLobbies, broadcastLobbies,
    generateRoomCode, getRoom, broadcastRoomState, sendTurnStart,
    removePlayerFromRoom, awardPotAndEndGame
} from './room-manager.js';

import { getBalance, addBalance, deductBalance } from './currency.js';
import { isDatabaseEnabled, query, withTransaction } from './db.js';
import {
    updateBrainAgeLeaderboard,
    updateGameLeaderboard,
    getBrainLeaderboard,
    getGameLeaderboards,
    VALID_BRAIN_GAME_IDS
} from './brain-leaderboards.js';
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
import { placeBet, getActiveBets, getPlayerBets } from './lol-betting.js';
import { parseRiotId, validateRiotId } from './riot-api.js';

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

// ============== SOUNDBOARD STATE ==============

const SOUNDBOARD_ROOM = 'lobby-soundboard';
const SOUNDBOARD_VALID_IDS = new Set([
    'anatolia', 'elgato', 'fahh', 'massenhausen', 'plug',
    'reverbfart', 'rizz', 'seyuh', 'vineboom'
]);

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

function calculateBrainCoins(brainAge) {
    if (brainAge <= 25) return 50;
    if (brainAge <= 35) return 30;
    if (brainAge <= 45) return 20;
    if (brainAge <= 55) return 10;
    return 5;
}

function calculateTrainingCoins(score) {
    // Training: half of daily test coins, minimum 2
    const brainAge = Math.round(80 - (score / 100) * 60);
    const clamped = Math.max(20, Math.min(80, brainAge));
    return Math.max(2, Math.floor(calculateBrainCoins(clamped) / 2));
}

 

function getUtcDayNumber(date = new Date()) {
    return Math.floor(date.getTime() / (1000 * 60 * 60 * 24));
}

async function hasBrainDailyReward(name) {
    const day = getUtcDayNumber();
    if (!isDatabaseEnabled()) {
        return { alreadyCompleted: brainDailyCooldown.get(name) === day, day };
    }

    const result = await query(
        `select 1
         from wallet_ledger wl
         join players p on p.id = wl.player_id
         where p.name = $1
           and wl.reason = 'brain_daily'
           and (wl.created_at at time zone 'utc')::date = (now() at time zone 'utc')::date
         limit 1`,
        [name]
    );
    return { alreadyCompleted: result.rowCount > 0, day };
}

function markBrainDailyReward(name, day) {
    brainDailyCooldown.set(name, day);
}

function scheduleBrainLeaderboardBroadcast() {
    if (brainLeaderboardBroadcastTimer) return;
    brainLeaderboardBroadcastTimer = setTimeout(() => {
        brainLeaderboardBroadcastTimer = null;
        getBrainLeaderboard().then((board) => {
            _io?.emit('brain-leaderboard', board);
        }).catch(err => console.error('brain-leaderboard error:', err.message));
    }, BRAIN_LEADERBOARD_THROTTLE_MS);
}

function scheduleBrainGameLeaderboardsBroadcast() {
    if (brainGameLeaderboardsTimer) return;
    brainGameLeaderboardsTimer = setTimeout(() => {
        brainGameLeaderboardsTimer = null;
        getGameLeaderboards().then((boards) => {
            _io?.emit('brain-game-leaderboards', boards);
        }).catch(err => console.error('brain-game-leaderboards error:', err.message));
    }, BRAIN_LEADERBOARD_THROTTLE_MS);
}

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
const brainDailyCooldown = new Map(); // name -> dayNumber
let brainLeaderboardBroadcastTimer = null;
let brainGameLeaderboardsTimer = null;
const BRAIN_LEADERBOARD_THROTTLE_MS = 1000;

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

        // --- Get Player Character (for contacts app) ---
        socket.on('get-player-character', (data) => { try {
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
                socket.emit('player-character', {
                    name: found.name,
                    character: found.character,
                    game: found.game
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
            const leaderboard = await getLeaderboardSnapshot(quotes);
            socket.emit('stock-leaderboard', leaderboard);

            const performanceLeaderboard = await getTradePerformanceLeaderboard(quotes);
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

        // --- Place Bet ---
        socket.on('place-bet', async (data) => { try {
            if (!checkRateLimit(socket)) return;
            if (!data || typeof data !== 'object') return;

            const room = getRoom(socket.id);
            if (!room || room.game) return; // Only in waiting room, before game starts
            if (room.gameType !== 'maexchen') return; // Only for Mäxchen

            const amount = Number(data.amount);
            if (!Number.isInteger(amount) || amount < 0 || amount > 1000) return;

            const player = room.players.find(p => p.socketId === socket.id);
            if (!player) return;

            // Initialize bets map if needed
            if (!room.bets) room.bets = {};

            // Enforce uniform bet: first non-zero bet sets the required amount
            if (amount > 0) {
                if (room.requiredBet === undefined || room.requiredBet === 0) {
                    room.requiredBet = amount;
                } else if (amount !== room.requiredBet) {
                    socket.emit('error', { message: `Alle müssen ${room.requiredBet} Coins setzen!` });
                    return;
                }
            }

            const balance = await getBalance(player.name);
            if (amount > balance) {
                socket.emit('error', { message: 'Nicht genug Coins!' });
                return;
            }

            room.bets[socket.id] = amount;

            // If all non-zero bets are removed, reset requiredBet
            if (amount === 0) {
                const anyBets = room.players.some(p => (room.bets[p.socketId] || 0) > 0);
                if (!anyBets) {
                    room.requiredBet = 0;
                }
            }

            // Broadcast updated bets to room
            const betsInfo = room.players.map(p => ({
                name: p.name,
                bet: room.bets[p.socketId] || 0
            }));
            io.to(room.code).emit('bets-update', { bets: betsInfo, requiredBet: room.requiredBet || 0 });

            console.log(`${player.name} bet ${amount} coins in ${room.code}`);
        } catch (err) { console.error('place-bet error:', err.message); } });

        // --- Start Game ---
        socket.on('start-game', async () => { try {
            if (!checkRateLimit(socket)) return;
            const room = getRoom(socket.id);
            if (!room) return;

            if (room.hostId !== socket.id) {
                socket.emit('error', { message: 'Nur der Host kann starten!' });
                return;
            }
            if (room.gameType !== 'watchparty' && room.players.length < 2) {
                socket.emit('error', { message: 'Mindestens 2 Spieler!' });
                return;
            }

            // Deduct bets from player balances for Mäxchen
            let pot = 0;
            const betBalances = new Map();
            if (room.gameType === 'maexchen' && room.bets) {
                for (const p of room.players) {
                    const bet = room.bets[p.socketId] || 0;
                    if (bet > 0) {
                        const result = await deductBalance(p.name, bet, 'maexchen_bet', { roomCode: room.code });
                        if (result === null) {
                            // Player can no longer afford their bet, reset to 0
                            room.bets[p.socketId] = 0;
                        } else {
                            pot += bet;
                            betBalances.set(p.socketId, result);
                        }
                    }
                }
            }

            room.game = {
                players: room.players.map(p => ({
                    socketId: p.socketId,
                    name: p.name,
                    lives: STARTING_LIVES,
                    character: p.character
                })),
                currentIndex: 0,
                previousAnnouncement: null,
                isFirstTurn: true,
                currentRoll: null,
                hasRolled: false,
                pot: pot || 0
            };

            io.to(room.code).emit('game-started', {
                players: room.game.players.map(p => ({ name: p.name, lives: p.lives, character: p.character })),
                pot: room.game.pot
            });

            // Send updated balances to all players after bet deduction
            if (pot > 0) {
                for (const p of room.players) {
                    const balance = betBalances.get(p.socketId);
                    emitBalanceUpdate(io, p.socketId, balance);
                }
            }

            sendTurnStart(io, room);
            broadcastLobbies(io, room.gameType);
            console.log(`Game started in ${room.code} (pot: ${pot})`);
        } catch (err) { console.error('start-game error:', err.message); } });

        // --- Roll Dice ---
        socket.on('roll', () => { try {
            if (!checkRateLimit(socket)) return;
            const room = getRoom(socket.id);
            if (!room || !room.game) return;
            const game = room.game;

            const currentPlayer = game.players[game.currentIndex];
            if (currentPlayer.socketId !== socket.id) return;
            if (game.hasRolled) return;

            if (!game.isFirstTurn && game.previousAnnouncement && isMaexchen(game.previousAnnouncement.value)) {
                socket.emit('error', { message: 'Mäxchen! Du musst anzweifeln oder glauben.' });
                return;
            }

            game.currentRoll = rollDice();
            game.hasRolled = true;

            io.to(room.code).emit('dice-rolled', {
                playerName: currentPlayer.name
            });

            socket.emit('roll-result', {
                d1: game.currentRoll.d1,
                d2: game.currentRoll.d2,
                value: game.currentRoll.value,
                name: rollName(game.currentRoll.value)
            });

            console.log(`${currentPlayer.name} rolled ${game.currentRoll.value}`);
        } catch (err) { console.error('roll error:', err.message); } });

        // --- Announce ---
        socket.on('announce', (value) => { try {
            if (!checkRateLimit(socket)) return;

            // Validate: must be a number in ROLL_ORDER
            if (typeof value !== 'number' || !Number.isInteger(value)) return;

            const room = getRoom(socket.id);
            if (!room || !room.game) return;
            const game = room.game;

            const currentPlayer = game.players[game.currentIndex];
            if (currentPlayer.socketId !== socket.id) return;
            if (!game.hasRolled) return;

            if (!ROLL_ORDER.includes(value)) {
                socket.emit('error', { message: 'Ungültiger Wert!' });
                return;
            }

            if (!game.isFirstTurn && game.previousAnnouncement) {
                if (rollRank(value) <= rollRank(game.previousAnnouncement.value)) {
                    socket.emit('error', { message: 'Muss höher sein!' });
                    return;
                }
            }

            game.previousAnnouncement = {
                playerIndex: game.currentIndex,
                playerName: currentPlayer.name,
                value,
                valueName: rollName(value),
                actualRoll: game.currentRoll
            };
            game.isFirstTurn = false;

            io.to(room.code).emit('player-announced', {
                playerIndex: game.currentIndex,
                playerName: currentPlayer.name,
                value,
                valueName: rollName(value)
            });

            game.currentIndex = nextAlivePlayerIndex(game, game.currentIndex);
            sendTurnStart(io, room);

            console.log(`${currentPlayer.name} announced ${rollName(value)}`);
        } catch (err) { console.error('announce error:', err.message); } });

        // --- Challenge ---
        socket.on('challenge', async () => { try {
            if (!checkRateLimit(socket)) return;
            const room = getRoom(socket.id);
            if (!room || !room.game) return;
            const game = room.game;

            const challenger = game.players[game.currentIndex];
            if (challenger.socketId !== socket.id) return;
            if (game.isFirstTurn || !game.previousAnnouncement) return;

            const announcerIndex = game.previousAnnouncement.playerIndex;
            const announcer = game.players[announcerIndex];
            const announced = game.previousAnnouncement.value;
            const actual = game.previousAnnouncement.actualRoll;

            const wasLying = rollRank(actual.value) < rollRank(announced);
            const livesLost = isMaexchen(announced) ? 2 : 1;

            const loserIndex = wasLying ? announcerIndex : game.currentIndex;
            game.players[loserIndex].lives = Math.max(0, game.players[loserIndex].lives - livesLost);

            io.to(room.code).emit('challenge-result', {
                challengerName: challenger.name,
                announcerName: announcer.name,
                actualRoll: actual,
                actualName: rollName(actual.value),
                announced,
                announcedName: rollName(announced),
                wasLying,
                loserName: game.players[loserIndex].name,
                loserIndex,
                livesLost,
                players: game.players.map(p => ({ name: p.name, lives: p.lives }))
            });

            const alive = getAlivePlayers(game);
            if (alive.length <= 1) {
                const winnerName = alive[0]?.name || 'Niemand';
                await awardPotAndEndGame(io, room, winnerName, alive);
                return;
            }

            game.currentIndex = game.players[loserIndex].lives > 0
                ? loserIndex
                : nextAlivePlayerIndex(game, loserIndex);
            game.previousAnnouncement = null;
            game.isFirstTurn = true;

            setTimeout(() => { try { if (room.game) sendTurnStart(io, room); } catch (e) { console.error('sendTurnStart error:', e.message); } }, 3000);
        } catch (err) { console.error('challenge error:', err.message); } });

        // --- Believe Mäxchen ---
        socket.on('believe-maexchen', async () => { try {
            if (!checkRateLimit(socket)) return;
            const room = getRoom(socket.id);
            if (!room || !room.game) return;
            const game = room.game;

            const believer = game.players[game.currentIndex];
            if (believer.socketId !== socket.id) return;
            if (!game.previousAnnouncement || !isMaexchen(game.previousAnnouncement.value)) return;

            const actual = game.previousAnnouncement.actualRoll;
            const wasRealMaexchen = isMaexchen(actual.value);

            game.players[game.currentIndex].lives = Math.max(0, game.players[game.currentIndex].lives - 2);

            io.to(room.code).emit('maexchen-believed', {
                believerName: believer.name,
                actualRoll: actual,
                actualName: rollName(actual.value),
                wasRealMaexchen,
                players: game.players.map(p => ({ name: p.name, lives: p.lives }))
            });

            const alive = getAlivePlayers(game);
            if (alive.length <= 1) {
                const winnerName = alive[0]?.name || 'Niemand';
                await awardPotAndEndGame(io, room, winnerName, alive);
                return;
            }

            game.currentIndex = believer.lives > 0
                ? game.currentIndex
                : nextAlivePlayerIndex(game, game.currentIndex);
            game.previousAnnouncement = null;
            game.isFirstTurn = true;

            setTimeout(() => { try { if (room.game) sendTurnStart(io, room); } catch (e) { console.error('sendTurnStart error:', e.message); } }, 3000);
        } catch (err) { console.error('believe-maexchen error:', err.message); } });

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

        socket.on('brain-get-leaderboard', async () => { try {
            if (!checkRateLimit(socket)) return;
            const leaderboard = await getBrainLeaderboard();
            const gameBoards = await getGameLeaderboards();
            socket.emit('brain-leaderboard', leaderboard);
            socket.emit('brain-game-leaderboards', gameBoards);
        } catch (err) { console.error('brain-get-leaderboard error:', err.message); } });

        socket.on('brain-submit-score', async (data) => { try {
            if (!checkRateLimit(socket)) return;
            if (!data || typeof data.playerName !== 'string') return;
            const name = sanitizeName(data.playerName);
            if (!name) return;

            const brainAge = Number(data.brainAge);
            if (!Number.isFinite(brainAge) || brainAge < 20 || brainAge > 80) return;

            // Server calculates coins (don't trust client)
            const coins = calculateBrainCoins(brainAge);

            // Update leaderboard (keep best score = lowest brain age)
            await updateBrainAgeLeaderboard(name, brainAge);

            // Award coins (once per UTC day)
            const dailyStatus = await hasBrainDailyReward(name);
            if (!dailyStatus.alreadyCompleted) {
                    const newBalance = await addBalance(name, coins, 'brain_daily', { day: dailyStatus.day });
                    if (newBalance !== null) {
                        socket.emit('balance-update', { balance: newBalance });
                    }
                markBrainDailyReward(name, dailyStatus.day);
            } else {
                socket.emit('brain-daily-cooldown', { day: dailyStatus.day });
            }

            // Broadcast updated leaderboard (throttled)
            scheduleBrainLeaderboardBroadcast();

            // Update per-game leaderboards from daily test games
            if (Array.isArray(data.games)) {
                for (const g of data.games) {
                    if (g && VALID_BRAIN_GAME_IDS.includes(g.gameId)) {
                        const s = Number(g.score);
                        const maxScore = g.gameId === 'reaction' ? 10000 : 100;
                        if (Number.isFinite(s) && s >= 0 && s <= maxScore) {
                            await updateGameLeaderboard(g.gameId, name, s);
                        }
                    }
                }
                scheduleBrainGameLeaderboardsBroadcast();
            }
        } catch (err) { console.error('brain-submit-score error:', err.message); } });

        socket.on('brain-training-score', async (data) => { try {
            if (!checkRateLimit(socket)) return;
            if (!data || typeof data.playerName !== 'string') return;
            const name = sanitizeName(data.playerName);
            if (!name) return;

            // Update per-game leaderboard
            if (data.gameId && VALID_BRAIN_GAME_IDS.includes(data.gameId)) {
                const s = Number(data.score);
                const maxScore = data.gameId === 'reaction' ? 10000 : 100;
                if (Number.isFinite(s) && s >= 0 && s <= maxScore) {
                    await updateGameLeaderboard(data.gameId, name, s);
                    scheduleBrainGameLeaderboardsBroadcast();

                    // Server calculates coins (don't trust client)
                    // For reaction, convert sum of ms to normalized 0-100 score for coin calc
                    // 5 rounds: 750ms sum (150ms avg) = 100, 2500ms sum (500ms avg) = 0
                    const coinScore = data.gameId === 'reaction'
                        ? Math.round(Math.max(0, Math.min(100, ((2500 - s) / 1750) * 100)))
                        : s;
                    const coins = calculateTrainingCoins(coinScore);
                    const newBalance = await addBalance(name, coins, 'brain_training');
                    if (newBalance !== null) {
                        socket.emit('balance-update', { balance: newBalance });
                    }
                }
            }
        } catch (err) { console.error('brain-training-score error:', err.message); } });

        // ============== STRICT BRAIN VERSUS MODE ==============

        socket.on('brain-versus-create', (data) => { try {
            if (!checkRateLimit(socket)) return;
            const playerName = sanitizeName(typeof data === 'object' ? data.playerName : data);
            if (!playerName) { socket.emit('error', { message: 'Name ungültig!' }); return; }
            const existingRoom = getRoom(socket.id);
            if (existingRoom) { socket.emit('error', { message: 'Du bist bereits in einem Raum!' }); return; }

            const code = generateRoomCode();
            const room = {
                code,
                hostId: socket.id,
                gameType: 'strictbrain',
                players: [{ socketId: socket.id, name: playerName, character: null }],
                game: null
            };
            rooms.set(code, room);
            socketToRoom.set(socket.id, code);
            socket.join(code);

            socket.emit('brain-versus-created', { code });
            broadcastLobbies(io, 'strictbrain');
            console.log(`Brain versus room ${code} created by ${playerName}`);
        } catch (err) { console.error('brain-versus-create error:', err.message); } });

        socket.on('brain-versus-join', (data) => { try {
            if (!checkRateLimit(socket)) return;
            if (!data || typeof data !== 'object') return;
            const code = validateRoomCode((data.code || '').toUpperCase());
            const playerName = sanitizeName(data.playerName);
            if (!playerName) { socket.emit('error', { message: 'Name ungültig!' }); return; }
            if (code.length !== 4) { socket.emit('error', { message: 'Ungültiger Raum-Code!' }); return; }

            const room = rooms.get(code);
            if (!room) { socket.emit('error', { message: 'Raum nicht gefunden!' }); return; }
            if (room.gameType !== 'strictbrain') { socket.emit('error', { message: 'Kein Brain-Versus Raum!' }); return; }
            if (room.game) { socket.emit('error', { message: 'Spiel läuft bereits!' }); return; }
            if (room.players.length >= 2) { socket.emit('error', { message: 'Raum ist voll (max. 2 Spieler)!' }); return; }
            if (room.players.some(p => p.socketId === socket.id)) { socket.emit('error', { message: 'Du bist bereits in diesem Raum!' }); return; }

            room.players.push({ socketId: socket.id, name: playerName, character: null });
            socketToRoom.set(socket.id, code);
            socket.join(code);

            const playerNames = room.players.map(p => p.name);
            io.to(room.code).emit('brain-versus-lobby', { code, players: playerNames, hostId: room.hostId });
            broadcastLobbies(io, 'strictbrain');
            console.log(`${playerName} joined brain versus room ${code}`);
        } catch (err) { console.error('brain-versus-join error:', err.message); } });

        socket.on('brain-versus-start', (data) => { try {
            if (!checkRateLimit(socket)) return;
            const room = getRoom(socket.id);
            if (!room || room.gameType !== 'strictbrain') return;
            if (room.hostId !== socket.id) { socket.emit('error', { message: 'Nur der Host kann starten!' }); return; }
            if (room.players.length < 2) { socket.emit('error', { message: 'Warte auf einen Gegner!' }); return; }

            const gameId = (data && VALID_BRAIN_GAME_IDS.includes(data.gameId)) ? data.gameId : VALID_BRAIN_GAME_IDS[Math.floor(Math.random() * VALID_BRAIN_GAME_IDS.length)];

            room.game = {
                gameId: gameId,
                players: room.players.map(p => ({ socketId: p.socketId, name: p.name, score: 0, finished: false, finalScore: null })),
                startedAt: Date.now()
            };

            io.to(room.code).emit('brain-versus-game-start', { gameId, players: room.game.players.map(p => ({ name: p.name })) });
            broadcastLobbies(io, 'strictbrain');
            console.log(`Brain versus started in ${room.code}: ${gameId}`);
        } catch (err) { console.error('brain-versus-start error:', err.message); } });

        socket.on('brain-versus-score-update', (data) => { try {
            const room = getRoom(socket.id);
            if (!room || !room.game || room.gameType !== 'strictbrain') return;
            const player = room.game.players.find(p => p.socketId === socket.id);
            if (!player || player.finished) return;

            const score = Number(data && data.score);
            if (!Number.isFinite(score) || score < 0) return;
            player.score = Math.min(9999, Math.round(score));

            io.to(room.code).emit('brain-versus-scores', {
                players: room.game.players.map(p => ({ name: p.name, score: p.score, finished: p.finished }))
            });
        } catch (err) { console.error('brain-versus-score-update error:', err.message); } });

        socket.on('brain-versus-finished', async (data) => { try {
            if (!checkRateLimit(socket)) return;
            const room = getRoom(socket.id);
            if (!room || !room.game || room.gameType !== 'strictbrain') return;
            const player = room.game.players.find(p => p.socketId === socket.id);
            if (!player || player.finished) return;

            const finalScore = Number(data && data.score);
            const isReaction = room.game.gameId === 'reaction';
            const maxAllowed = isReaction ? 10000 : 100;
            if (!Number.isFinite(finalScore) || finalScore < 0 || finalScore > maxAllowed) return;
            player.finished = true;
            player.finalScore = finalScore;
            player.score = finalScore;

            // Check if both finished
            const allFinished = room.game.players.every(p => p.finished);
            if (allFinished) {
                // Reaction: lower ms = better; others: higher = better
                let sorted, winner, isDraw;
                if (isReaction) {
                    sorted = [...room.game.players].sort((a, b) => a.finalScore - b.finalScore);
                    winner = sorted[0].finalScore < sorted[1].finalScore ? sorted[0].name : null;
                    isDraw = sorted[0].finalScore === sorted[1].finalScore;
                } else {
                    sorted = [...room.game.players].sort((a, b) => b.finalScore - a.finalScore);
                    winner = sorted[0].finalScore > sorted[1].finalScore ? sorted[0].name : null;
                    isDraw = sorted[0].finalScore === sorted[1].finalScore;
                }

                // Award coins
                const winnerCoins = 20;
                const loserCoins = 5;
                const drawCoins = 10;

                for (const p of room.game.players) {
                    let coins;
                    if (isDraw) { coins = drawCoins; }
                    else if (p.name === winner) { coins = winnerCoins; }
                    else { coins = loserCoins; }

                    const newBalance = await addBalance(p.name, coins, 'brain_versus_reward', { roomCode: room.code });
                    emitBalanceUpdate(io, p.socketId, newBalance);
                }

                io.to(room.code).emit('brain-versus-result', {
                    winner: winner,
                    isDraw: isDraw,
                    players: room.game.players.map(p => ({ name: p.name, score: p.finalScore })),
                    coins: isDraw ? drawCoins : winnerCoins
                });

                room.game = null;
                console.log(`Brain versus ended in ${room.code}: ${isDraw ? 'draw' : winner + ' wins'}`);
            } else {
                io.to(room.code).emit('brain-versus-scores', {
                    players: room.game.players.map(p => ({ name: p.name, score: p.score, finished: p.finished }))
                });
            }
        } catch (err) { console.error('brain-versus-finished error:', err.message); } });

        socket.on('brain-versus-leave', async () => { try {
            if (!checkRateLimit(socket)) return;
            const room = getRoom(socket.id);
            if (!room || room.gameType !== 'strictbrain') return;

            socket.leave(room.code);

            // If game was running, opponent wins by default
            if (room.game) {
                const opponent = room.game.players.find(p => p.socketId !== socket.id);
                if (opponent) {
                    const newBalance = await addBalance(opponent.name, 20, 'brain_versus_forfeit', { roomCode: room.code });
                    emitBalanceUpdate(io, opponent.socketId, newBalance);
                    io.to(opponent.socketId).emit('brain-versus-result', {
                        winner: opponent.name,
                        isDraw: false,
                        players: room.game.players.map(p => ({ name: p.name, score: p.finalScore || 0 })),
                        coins: 20,
                        forfeit: true
                    });
                }
                room.game = null;
            }

            // Remove player from room
            const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
            if (playerIndex !== -1) {
                const playerName = room.players[playerIndex].name;
                room.players.splice(playerIndex, 1);
                socketToRoom.delete(socket.id);
                io.to(room.code).emit('brain-versus-player-left', { playerName });
            }

            if (room.players.length === 0) {
                rooms.delete(room.code);
            } else if (room.hostId === socket.id) {
                room.hostId = room.players[0].socketId;
            }

            broadcastLobbies(io, 'strictbrain');
        } catch (err) { console.error('brain-versus-leave error:', err.message); } });

        // ============== LOL BETTING ==============

        // --- Validate LoL Username (Riot ID) ---
        socket.on('lol-validate-username', async (data) => { try {
            if (!checkRateLimit(socket, 5)) return;
            if (!data || typeof data !== 'object') return;

            const { riotId } = data;
            if (typeof riotId !== 'string') {
                socket.emit('lol-username-result', { valid: false, reason: 'Invalid input' });
                return;
            }

            const result = await validateRiotId(riotId);
            socket.emit('lol-username-result', result);
        } catch (err) {
            console.error('lol-validate-username error:', err.message);
            socket.emit('lol-username-result', { valid: false, reason: err.message || 'Validation failed' });
        } });

        // --- Place LoL Bet ---
        socket.on('lol-place-bet', async (data) => { try {
            if (!checkRateLimit(socket, 5)) return;
            if (!data || typeof data !== 'object') return;

            const player = onlinePlayers.get(socket.id);
            if (!player) {
                socket.emit('lol-bet-error', { message: 'Not logged in' });
                return;
            }
            const playerName = player.name;

            const { lolUsername, amount, betOnWin } = data;

            // Validate Riot ID format (API lookup already happened in lol-validate-username)
            const parsed = parseRiotId(lolUsername);
            if (!parsed) {
                socket.emit('lol-bet-error', { message: 'Invalid Riot ID format. Use Name#Tag' });
                return;
            }
            const resolvedName = parsed.gameName + '#' + parsed.tagLine;

            const betAmount = Number(amount);
            if (!Number.isFinite(betAmount) || !Number.isInteger(betAmount) || betAmount <= 0 || betAmount > 1000) {
                socket.emit('lol-bet-error', { message: 'Invalid bet amount (1-1000 coins)' });
                return;
            }

            if (typeof betOnWin !== 'boolean') {
                socket.emit('lol-bet-error', { message: 'Invalid bet type' });
                return;
            }

            // Check balance
            const balance = await getBalance(playerName);
            if (balance < betAmount) {
                socket.emit('lol-bet-error', { message: 'Insufficient balance' });
                return;
            }

            let newBalance;
            let bet;

            if (isDatabaseEnabled()) {
                // DB mode: wrap deduction + bet in a single transaction so
                // both succeed or both roll back — no lost currency on failure.
                const txResult = await withTransaction(async (client) => {
                    const bal = await deductBalance(playerName, betAmount, 'lol_bet', {
                        lolUsername: resolvedName,
                        betOnWin
                    }, client);
                    if (bal === null) {
                        return { ok: false };
                    }
                    const b = await placeBet(playerName, resolvedName, betAmount, betOnWin, client);
                    return { ok: true, newBalance: bal, bet: b };
                });
                if (!txResult.ok) {
                    socket.emit('lol-bet-error', { message: 'Insufficient balance' });
                    return;
                }
                newBalance = txResult.newBalance;
                bet = txResult.bet;
            } else {
                // In-memory mode: deduct first, refund if bet placement fails.
                newBalance = await deductBalance(playerName, betAmount, 'lol_bet', {
                    lolUsername: resolvedName,
                    betOnWin
                });
                if (newBalance === null) {
                    socket.emit('lol-bet-error', { message: 'Insufficient balance' });
                    return;
                }
                try {
                    bet = await placeBet(playerName, resolvedName, betAmount, betOnWin);
                } catch (betErr) {
                    // Refund the deducted amount on failure
                    await addBalance(playerName, betAmount, 'lol_bet_refund', {
                        lolUsername: resolvedName,
                        reason: betErr.message
                    });
                    throw betErr;
                }
            }

            // Send confirmation to player
            socket.emit('lol-bet-placed', {
                bet,
                newBalance
            });

            // Broadcast updated bets list to all clients
            const allBets = await getActiveBets();
            io.emit('lol-bets-update', { bets: allBets });

            console.log(`[LoL Bet] ${playerName} bet ${betAmount} on ${resolvedName} to ${betOnWin ? 'WIN' : 'LOSE'}`);
        } catch (err) {
            console.error('lol-place-bet error:', err.message);
            socket.emit('lol-bet-error', { message: 'Failed to place bet' });
        } });

        // --- Get Active LoL Bets ---
        socket.on('lol-get-bets', async () => { try {
            if (!checkRateLimit(socket)) return;

            const bets = await getActiveBets();
            socket.emit('lol-bets-update', { bets });
        } catch (err) {
            console.error('lol-get-bets error:', err.message);
        } });

        // --- Get Player LoL Bet History ---
        socket.on('lol-get-history', async () => { try {
            if (!checkRateLimit(socket)) return;

            const player = onlinePlayers.get(socket.id);
            if (!player) return;

            const history = await getPlayerBets(player.name);
            socket.emit('lol-history-update', { history });
        } catch (err) {
            console.error('lol-get-history error:', err.message);
        } });

        // ============== END LOL BETTING ==============

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

            cleanupPictoForSocket(socket.id, io);
            io.to(PICTO_ROOM).emit('picto-cursor-hide', { id: socket.id });

            // Remove from online players
            onlinePlayers.delete(socket.id);
            broadcastOnlinePlayers(io);

            const room = getRoom(socket.id);
            if (room) {
                // Brain Versus: handle forfeit before generic cleanup
                if (room.gameType === 'strictbrain' && room.game) {
                    const opponent = room.game.players.find(p => p.socketId !== socket.id);
                    if (opponent) {
                        const newBalance = await addBalance(opponent.name, 20, 'brain_versus_forfeit', { roomCode: room.code });
                        emitBalanceUpdate(io, opponent.socketId, newBalance);
                        io.to(opponent.socketId).emit('brain-versus-result', {
                            winner: opponent.name,
                            isDraw: false,
                            players: room.game.players.map(p => ({ name: p.name, score: p.finalScore || 0 })),
                            coins: 20,
                            forfeit: true
                        });
                    }
                    room.game = null;
                }
                await removePlayerFromRoom(io, socket.id, room);
                if (room.gameType === 'strictbrain') {
                    broadcastLobbies(io, 'strictbrain');
                }
            }
        } catch (err) { console.error('disconnect error:', err.message); } });
    });
}

