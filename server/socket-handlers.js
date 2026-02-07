import {
    ROLL_ORDER, STARTING_LIVES,
    rollRank, rollName, rollDice, isMaexchen,
    getAlivePlayers, nextAlivePlayerIndex
} from './game-logic.js';

import {
    rooms, onlinePlayers, socketToRoom,
    broadcastOnlinePlayers, getOpenLobbies, broadcastLobbies,
    generateRoomCode, getRoom, broadcastRoomState, sendTurnStart,
    removePlayerFromRoom
} from './room-manager.js';

import { getBalance, addBalance, deductBalance } from './currency.js';
import { buyStock, sellStock, getPortfolioSnapshot, getAllPortfolioPlayerNames } from './stock-game.js';

// ============== INPUT VALIDATION ==============

function sanitizeName(name) {
    if (typeof name !== 'string') return '';
    return name.replace(/[<>&"'/]/g, '').trim().slice(0, 20);
}

function validateCharacter(character) {
    if (!character || typeof character !== 'object') return null;
    // Limit character data size (~2KB JSON max)
    const json = JSON.stringify(character);
    if (json.length > 2048) return null;
    // Only allow expected keys
    const allowed = { pixels: true, dataURL: true };
    const clean = {};
    for (const key of Object.keys(character)) {
        if (allowed[key]) clean[key] = character[key];
    }
    // Validate dataURL if present
    if (clean.dataURL && (typeof clean.dataURL !== 'string' || !clean.dataURL.startsWith('data:image/'))) {
        delete clean.dataURL;
    }
    return clean;
}

function validateRoomCode(code) {
    if (typeof code !== 'string') return '';
    return code.replace(/[^A-Z0-9]/g, '').slice(0, 4);
}

function validateGameType(gameType) {
    if (typeof gameType !== 'string') return 'maexchen';
    const allowed = ['maexchen', 'lobby', 'watchparty', 'stocks', 'strictbrain'];
    const clean = gameType.replace(/[^a-z]/g, '').slice(0, 20);
    return allowed.includes(clean) ? clean : 'maexchen';
}

function validateYouTubeId(videoId) {
    if (typeof videoId !== 'string') return '';
    return videoId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 11);
}

// ============== RATE LIMITING ==============

const rateLimiters = new Map(); // socketId -> { count, resetTime }

function checkRateLimit(socketId, maxPerSecond = 10) {
    const now = Date.now();
    let entry = rateLimiters.get(socketId);
    if (!entry || now > entry.resetTime) {
        entry = { count: 0, resetTime: now + 1000 };
        rateLimiters.set(socketId, entry);
    }
    entry.count++;
    return entry.count <= maxPerSecond;
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
    redoStacks: new Map()  // socketId -> stroke[]
};

function normalizePoint(point) {
    if (!point || typeof point !== 'object') return null;
    const x = Number(point.x);
    const y = Number(point.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
}

function sanitizeColor(color) {
    if (typeof color !== 'string') return '#000000';
    return /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#000000';
}

function sanitizeSize(size) {
    const n = Number(size);
    if (!Number.isFinite(n)) return 4;
    return Math.max(1, Math.min(18, Math.round(n)));
}

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

function cleanupPictoForSocket(socketId) {
    pictoState.redoStacks.delete(socketId);
    for (const [strokeId, stroke] of pictoState.inProgress.entries()) {
        if (stroke.authorId === socketId) {
            pictoState.inProgress.delete(strokeId);
        }
    }
}

// ============== STRICT BRAIN STATE ==============

const brainLeaderboard = new Map(); // playerName -> brainAge (best daily test)

function getBrainLeaderboardSorted() {
    const entries = [];
    for (const [name, brainAge] of brainLeaderboard) {
        entries.push({ name, brainAge });
    }
    // Sort by brain age ascending (lower = better)
    entries.sort((a, b) => a.brainAge - b.brainAge);
    return entries.slice(0, 10);
}

export function cleanupRateLimiters() {
    const now = Date.now();
    for (const [id, entry] of rateLimiters) {
        if (now > entry.resetTime) rateLimiters.delete(id);
    }
}

// ============== SOCKET HANDLERS ==============

// ============== STOCK GAME ==============

let _fetchTickerQuotes = null;
let _yahooFinance = null;

export function registerSocketHandlers(io, { fetchTickerQuotes, yahooFinance } = {}) {
    _fetchTickerQuotes = fetchTickerQuotes || null;
    _yahooFinance = yahooFinance || null;
    io.on('connection', (socket) => {
        console.log(`Connected: ${socket.id}`);

        // Send current online players to new connection
        socket.emit('online-players', Array.from(onlinePlayers.values()));

        // --- Register Player (when they enter their name) ---
        socket.on('register-player', (data) => { try {
            if (!checkRateLimit(socket.id)) return;
            if (!data || typeof data !== 'object') return;

            const name = sanitizeName(data.name);
            if (!name) return;
            const character = validateCharacter(data.character);
            const game = validateGameType(data.game);

            onlinePlayers.set(socket.id, { name, character, game });
            broadcastOnlinePlayers(io);

            // Send currency balance to the player
            socket.emit('balance-update', { balance: getBalance(name) });

            console.log(`Registered: ${name} for ${game}`);
        } catch (err) { console.error('register-player error:', err.message); } });

        // --- Get Player Character (for contacts app) ---
        socket.on('get-player-character', (data) => { try {
            if (!checkRateLimit(socket.id)) return;
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
        socket.on('get-balance', () => { try {
            if (!checkRateLimit(socket.id)) return;
            const player = onlinePlayers.get(socket.id);
            if (!player) return;
            socket.emit('balance-update', { balance: getBalance(player.name) });
        } catch (err) { console.error('get-balance error:', err.message); } });

        // --- Stock Game: Buy ---
        socket.on('stock-buy', async (data) => { try {
            if (!checkRateLimit(socket.id)) return;
            const player = onlinePlayers.get(socket.id);
            if (!player) return;
            if (!data || typeof data !== 'object') return;

            const symbol = typeof data.symbol === 'string'
                ? data.symbol.replace(/[^A-Z0-9.\-=]/g, '').slice(0, 12) : '';
            if (!symbol) {
                socket.emit('stock-error', { error: 'Invalid symbol' });
                return;
            }
            const amount = Number(data.amount);
            if (!Number.isFinite(amount) || amount <= 0) {
                socket.emit('stock-error', { error: 'Invalid amount' });
                return;
            }

            // Get current price from ticker cache or live lookup
            const quotes = _fetchTickerQuotes ? await _fetchTickerQuotes() : [];
            let quote = quotes.find(q => q.symbol === symbol);
            if (!quote && _yahooFinance) {
                try {
                    const q = await _yahooFinance.quote(symbol);
                    if (q && q.regularMarketPrice != null) {
                        quote = {
                            symbol: (q.symbol || symbol).replace('^', ''),
                            name: q.shortName || q.longName || symbol,
                            price: parseFloat(q.regularMarketPrice.toFixed(2)),
                        };
                    }
                } catch (e) { /* symbol not found */ }
            }
            if (!quote) {
                socket.emit('stock-error', { error: 'Price unavailable' });
                return;
            }

            const result = buyStock(player.name, quote.symbol, quote.price, amount);
            if (!result.ok) {
                socket.emit('stock-error', { error: result.error });
                return;
            }

            socket.emit('balance-update', { balance: result.newBalance });
            const snapshot = getPortfolioSnapshot(player.name, quotes);
            socket.emit('stock-portfolio', snapshot);
        } catch (err) { console.error('stock-buy error:', err.message); } });

        // --- Stock Game: Sell ---
        socket.on('stock-sell', async (data) => { try {
            if (!checkRateLimit(socket.id)) return;
            const player = onlinePlayers.get(socket.id);
            if (!player) return;
            if (!data || typeof data !== 'object') return;

            const symbol = typeof data.symbol === 'string'
                ? data.symbol.replace(/[^A-Z0-9.\-=]/g, '').slice(0, 12) : '';
            if (!symbol) {
                socket.emit('stock-error', { error: 'Invalid symbol' });
                return;
            }
            const amount = Number(data.amount);
            if (!Number.isFinite(amount) || amount <= 0) {
                socket.emit('stock-error', { error: 'Invalid amount' });
                return;
            }

            const quotes = _fetchTickerQuotes ? await _fetchTickerQuotes() : [];
            let quote = quotes.find(q => q.symbol === symbol);
            if (!quote && _yahooFinance) {
                try {
                    const q = await _yahooFinance.quote(symbol);
                    if (q && q.regularMarketPrice != null) {
                        quote = {
                            symbol: (q.symbol || symbol).replace('^', ''),
                            name: q.shortName || q.longName || symbol,
                            price: parseFloat(q.regularMarketPrice.toFixed(2)),
                        };
                    }
                } catch (e) { /* symbol not found */ }
            }
            if (!quote) {
                socket.emit('stock-error', { error: 'Price unavailable' });
                return;
            }

            const result = sellStock(player.name, quote.symbol, quote.price, amount);
            if (!result.ok) {
                socket.emit('stock-error', { error: result.error });
                return;
            }

            socket.emit('balance-update', { balance: result.newBalance });
            const snapshot = getPortfolioSnapshot(player.name, quotes);
            socket.emit('stock-portfolio', snapshot);
        } catch (err) { console.error('stock-sell error:', err.message); } });

        // --- Stock Game: Get Portfolio ---
        socket.on('stock-get-portfolio', async () => { try {
            if (!checkRateLimit(socket.id)) return;
            const player = onlinePlayers.get(socket.id);
            if (!player) return;

            const quotes = _fetchTickerQuotes ? await _fetchTickerQuotes() : [];
            const snapshot = getPortfolioSnapshot(player.name, quotes);
            socket.emit('stock-portfolio', snapshot);
        } catch (err) { console.error('stock-get-portfolio error:', err.message); } });

        // --- Stock Game: Get All Players' Portfolios (Leaderboard) ---
        socket.on('stock-get-leaderboard', async () => { try {
            if (!checkRateLimit(socket.id)) return;
            const player = onlinePlayers.get(socket.id);
            if (!player) return;

            const quotes = _fetchTickerQuotes ? await _fetchTickerQuotes() : [];
            const playerNames = getAllPortfolioPlayerNames();
            const leaderboard = [];

            for (const name of playerNames) {
                const snap = getPortfolioSnapshot(name, quotes);
                const cash = getBalance(name);
                leaderboard.push({
                    name,
                    portfolioValue: snap.totalValue,
                    cash,
                    netWorth: parseFloat((snap.totalValue + cash).toFixed(2)),
                    holdings: snap.holdings,
                });
            }

            // Sort by net worth descending
            leaderboard.sort((a, b) => b.netWorth - a.netWorth);
            socket.emit('stock-leaderboard', leaderboard);
        } catch (err) { console.error('stock-get-leaderboard error:', err.message); } });

        // --- Pictochat Join ---
        socket.on('picto-join', () => { try {
            if (!checkRateLimit(socket.id)) return;
            socket.join(PICTO_ROOM);
            socket.emit('picto-state', {
                strokes: pictoState.strokes
            });
        } catch (err) { console.error('picto-join error:', err.message); } });

        // --- Pictochat Cursor ---
        socket.on('picto-cursor', (data) => { try {
            if (!checkRateLimit(socket.id, 40)) return;
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
            if (!checkRateLimit(socket.id, 20)) return;
            socket.to(PICTO_ROOM).emit('picto-cursor-hide', {
                id: socket.id
            });
        } catch (err) { console.error('picto-cursor-hide error:', err.message); } });

        // --- Pictochat Stroke Segment ---
        socket.on('picto-stroke-segment', (data) => { try {
            if (!checkRateLimit(socket.id, 30)) return;
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
        socket.on('picto-stroke-end', (data) => { try {
            if (!checkRateLimit(socket.id, 10)) return;
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
        } catch (err) { console.error('picto-stroke-end error:', err.message); } });

        // --- Pictochat Shape ---
        socket.on('picto-shape', (data) => { try {
            if (!checkRateLimit(socket.id, 8)) return;
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
        } catch (err) { console.error('picto-shape error:', err.message); } });

        // --- Pictochat Undo ---
        socket.on('picto-undo', (data) => { try {
            if (!checkRateLimit(socket.id, 5)) return;
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
        } catch (err) { console.error('picto-undo error:', err.message); } });

        // --- Pictochat Redo ---
        socket.on('picto-redo', () => { try {
            if (!checkRateLimit(socket.id, 5)) return;

            const redo = getRedoStack(socket.id);
            if (!redo.length) return;

            const stroke = redo.pop();
            pictoState.strokes.push(stroke);
            trimStrokes();

            io.to(PICTO_ROOM).emit('picto-redo', {
                stroke,
                byId: socket.id
            });
        } catch (err) { console.error('picto-redo error:', err.message); } });

        // --- Pictochat Clear ---
        socket.on('picto-clear', () => { try {
            if (!checkRateLimit(socket.id, 2)) return;

            pictoState.strokes = [];
            getRedoStack(socket.id).length = 0;
            pictoState.inProgress.clear();

            io.to(PICTO_ROOM).emit('picto-clear', {
                byId: socket.id
            });
        } catch (err) { console.error('picto-clear error:', err.message); } });

        // --- Pictochat Message ---
        socket.on('picto-message', (text) => { try {
            if (!checkRateLimit(socket.id, 6)) return;
            if (typeof text !== 'string') return;
            const message = text.replace(/[<>&]/g, '').slice(0, 200).trim();
            if (!message) return;

            io.to(PICTO_ROOM).emit('picto-message', {
                name: getPictoName(socket.id),
                text: message,
                timestamp: Date.now()
            });
        } catch (err) { console.error('picto-message error:', err.message); } });

        // ============== SOUNDBOARD HANDLERS ==============

        socket.on('soundboard-join', () => { try {
            if (!checkRateLimit(socket.id)) return;
            socket.join(SOUNDBOARD_ROOM);
        } catch (err) { console.error('soundboard-join error:', err.message); } });

        socket.on('soundboard-play', (soundId) => { try {
            if (!checkRateLimit(socket.id, 3)) return;
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
            if (!checkRateLimit(socket.id)) return;
            const gt = validateGameType(gameType);
            const lobbies = getOpenLobbies(gt);
            socket.emit('lobbies-update', { gameType: gt, lobbies });
        } catch (err) { console.error('get-lobbies error:', err.message); } });

        // --- Create Room ---
        socket.on('create-room', (data) => { try {
            if (!checkRateLimit(socket.id)) return;

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
            if (!checkRateLimit(socket.id)) return;
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
        socket.on('place-bet', (data) => { try {
            if (!checkRateLimit(socket.id)) return;
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

            const balance = getBalance(player.name);
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
        socket.on('start-game', () => { try {
            if (!checkRateLimit(socket.id)) return;
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
            if (room.gameType === 'maexchen' && room.bets) {
                for (const p of room.players) {
                    const bet = room.bets[p.socketId] || 0;
                    if (bet > 0) {
                        const result = deductBalance(p.name, bet);
                        if (result === null) {
                            // Player can no longer afford their bet, reset to 0
                            room.bets[p.socketId] = 0;
                        } else {
                            pot += bet;
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
                    io.to(p.socketId).emit('balance-update', { balance: getBalance(p.name) });
                }
            }

            sendTurnStart(io, room);
            broadcastLobbies(io, room.gameType);
            console.log(`Game started in ${room.code} (pot: ${pot})`);
        } catch (err) { console.error('start-game error:', err.message); } });

        // --- Roll Dice ---
        socket.on('roll', () => { try {
            if (!checkRateLimit(socket.id)) return;
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
            if (!checkRateLimit(socket.id)) return;

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
        socket.on('challenge', () => { try {
            if (!checkRateLimit(socket.id)) return;
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
                const pot = game.pot || 0;

                // Award pot to winner
                if (pot > 0 && alive[0]) {
                    addBalance(alive[0].name, pot);
                    for (const p of room.players) {
                        io.to(p.socketId).emit('balance-update', { balance: getBalance(p.name) });
                    }
                }

                io.to(room.code).emit('game-over', {
                    winnerName,
                    players: game.players.map(p => ({ name: p.name, lives: p.lives })),
                    pot
                });
                room.game = null;
                return;
            }

            game.currentIndex = game.players[loserIndex].lives > 0
                ? loserIndex
                : nextAlivePlayerIndex(game, loserIndex);
            game.previousAnnouncement = null;
            game.isFirstTurn = true;

            setTimeout(() => { try { sendTurnStart(io, room); } catch (e) { console.error('sendTurnStart error:', e.message); } }, 3000);
        } catch (err) { console.error('challenge error:', err.message); } });

        // --- Believe Mäxchen ---
        socket.on('believe-maexchen', () => { try {
            if (!checkRateLimit(socket.id)) return;
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
                const pot = game.pot || 0;

                // Award pot to winner
                if (pot > 0 && alive[0]) {
                    addBalance(alive[0].name, pot);
                    for (const p of room.players) {
                        io.to(p.socketId).emit('balance-update', { balance: getBalance(p.name) });
                    }
                }

                io.to(room.code).emit('game-over', {
                    winnerName,
                    players: game.players.map(p => ({ name: p.name, lives: p.lives })),
                    pot
                });
                room.game = null;
                return;
            }

            game.currentIndex = believer.lives > 0
                ? game.currentIndex
                : nextAlivePlayerIndex(game, game.currentIndex);
            game.previousAnnouncement = null;
            game.isFirstTurn = true;

            setTimeout(() => { try { sendTurnStart(io, room); } catch (e) { console.error('sendTurnStart error:', e.message); } }, 3000);
        } catch (err) { console.error('believe-maexchen error:', err.message); } });

        // --- Emote ---
        socket.on('emote', (emoteId) => { try {
            if (!checkRateLimit(socket.id, 5)) return; // Stricter limit for emotes
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
            if (!checkRateLimit(socket.id, 5)) return; // Stricter limit for chat
            if (typeof text !== 'string') return;

            const room = getRoom(socket.id);
            if (!room) return;

            const player = room.players.find(p => p.socketId === socket.id);
            if (!player) return;

            const sanitizedText = text.replace(/[<>&]/g, '').slice(0, 100).trim();
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
            if (!checkRateLimit(socket.id, 3)) return; // Stricter limit for drawings
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
                room.players.forEach(p => {
                    if (p.socketId !== socket.id) {
                        io.to(p.socketId).emit('drawing-note', {
                            from: player.name,
                            dataURL: dataURL,
                            target: 'all'
                        });
                    }
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
            if (!checkRateLimit(socket.id, 5)) return;
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
            if (!checkRateLimit(socket.id, 5)) return;
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
            if (!checkRateLimit(socket.id, 5)) return;
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
            if (!checkRateLimit(socket.id)) return;

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

        socket.on('brain-get-leaderboard', () => { try {
            if (!checkRateLimit(socket.id)) return;
            socket.emit('brain-leaderboard', getBrainLeaderboardSorted());
        } catch (err) { console.error('brain-get-leaderboard error:', err.message); } });

        socket.on('brain-submit-score', (data) => { try {
            if (!checkRateLimit(socket.id)) return;
            if (!data || typeof data.playerName !== 'string') return;
            const name = sanitizeName(data.playerName);
            if (!name) return;

            const brainAge = Number(data.brainAge);
            if (!Number.isFinite(brainAge) || brainAge < 20 || brainAge > 80) return;

            const coins = Number(data.coins);
            if (!Number.isFinite(coins) || coins < 0 || coins > 100) return;

            // Update leaderboard (keep best score = lowest brain age)
            const current = brainLeaderboard.get(name);
            if (current === undefined || brainAge < current) {
                brainLeaderboard.set(name, brainAge);
            }

            // Award coins
            if (coins > 0) {
                addBalance(name, coins);
                socket.emit('balance-update', { balance: getBalance(name) });
            }

            // Broadcast updated leaderboard
            io.emit('brain-leaderboard', getBrainLeaderboardSorted());
        } catch (err) { console.error('brain-submit-score error:', err.message); } });

        socket.on('brain-training-score', (data) => { try {
            if (!checkRateLimit(socket.id)) return;
            if (!data || typeof data.playerName !== 'string') return;
            const name = sanitizeName(data.playerName);
            if (!name) return;

            const coins = Number(data.coins);
            if (!Number.isFinite(coins) || coins < 0 || coins > 50) return;

            // Award coins for free training
            if (coins > 0) {
                addBalance(name, coins);
                socket.emit('balance-update', { balance: getBalance(name) });
            }
        } catch (err) { console.error('brain-training-score error:', err.message); } });

        // --- Leave Room ---
        socket.on('leave-room', () => { try {
            if (!checkRateLimit(socket.id)) return;
            const room = getRoom(socket.id);
            if (!room) return;

            socket.leave(room.code);
            removePlayerFromRoom(io, socket.id, room);
        } catch (err) { console.error('leave-room error:', err.message); } });

        // --- Disconnect ---
        socket.on('disconnect', () => { try {
            // Cleanup rate limiter
            rateLimiters.delete(socket.id);

            cleanupPictoForSocket(socket.id);
            io.to(PICTO_ROOM).emit('picto-cursor-hide', { id: socket.id });

            // Remove from online players
            onlinePlayers.delete(socket.id);
            broadcastOnlinePlayers(io);

            const room = getRoom(socket.id);
            if (room) {
                removePlayerFromRoom(io, socket.id, room);
            }
        } catch (err) { console.error('disconnect error:', err.message); } });
    });
}
