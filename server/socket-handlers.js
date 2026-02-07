import {
    ROLL_ORDER, STARTING_LIVES,
    rollRank, rollName, rollDice, isMaexchen,
    getAlivePlayers, nextAlivePlayerIndex
} from './game-logic.js';

import {
    rooms, onlinePlayers,
    broadcastOnlinePlayers, getOpenLobbies, broadcastLobbies,
    generateRoomCode, getRoom, broadcastRoomState, sendTurnStart
} from './room-manager.js';

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
    const allowed = ['maexchen', 'lobby', 'watchparty'];
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

// ============== PICTOCHAT STATE ==============

const PICTO_ROOM = 'lobby-picto';
const PICTO_PAGE_COUNT = 4;
const PICTO_MAX_STROKES = 400;
const PICTO_MAX_POINTS = 800;
const PICTO_MAX_POINTS_PER_SEGMENT = 20;

const pictoState = {
    pages: Array.from({ length: PICTO_PAGE_COUNT }, () => ({ strokes: [] })),
    inProgress: new Map(), // strokeId -> stroke
    redoStacks: new Map()  // socketId -> { [page]: stroke[] }
};

function isValidPage(page) {
    return Number.isInteger(page) && page >= 0 && page < PICTO_PAGE_COUNT;
}

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

function getRedoStack(socketId, page) {
    if (!pictoState.redoStacks.has(socketId)) {
        pictoState.redoStacks.set(socketId, {});
    }
    const stacks = pictoState.redoStacks.get(socketId);
    if (!stacks[page]) stacks[page] = [];
    return stacks[page];
}

function trimStrokes(page) {
    if (!pictoState.pages[page]) return;
    const strokes = pictoState.pages[page].strokes;
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

export function cleanupRateLimiters() {
    const now = Date.now();
    for (const [id, entry] of rateLimiters) {
        if (now > entry.resetTime) rateLimiters.delete(id);
    }
}

// ============== SOCKET HANDLERS ==============

export function registerSocketHandlers(io) {
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
            console.log(`Registered: ${name} for ${game}`);
        } catch (err) { console.error('register-player error:', err.message); } });

        // --- Pictochat Join ---
        socket.on('picto-join', () => { try {
            if (!checkRateLimit(socket.id)) return;
            socket.join(PICTO_ROOM);
            socket.emit('picto-state', {
                pages: pictoState.pages,
                pageCount: PICTO_PAGE_COUNT
            });
        } catch (err) { console.error('picto-join error:', err.message); } });

        // --- Pictochat Page Request ---
        socket.on('picto-request-page', (data) => { try {
            if (!checkRateLimit(socket.id, 5)) return;
            const page = data?.page;
            if (!isValidPage(page)) return;
            socket.emit('picto-page', {
                page,
                strokes: pictoState.pages[page].strokes
            });
        } catch (err) { console.error('picto-request-page error:', err.message); } });

        // --- Pictochat Cursor ---
        socket.on('picto-cursor', (data) => { try {
            if (!checkRateLimit(socket.id, 40)) return;
            if (!data || typeof data !== 'object') return;
            const page = data.page;
            if (!isValidPage(page)) return;
            const point = normalizePoint({ x: data.x, y: data.y });
            if (!point) return;
            socket.to(PICTO_ROOM).emit('picto-cursor', {
                id: socket.id,
                name: getPictoName(socket.id),
                page,
                x: point.x,
                y: point.y
            });
        } catch (err) { console.error('picto-cursor error:', err.message); } });

        socket.on('picto-cursor-hide', (data) => { try {
            if (!checkRateLimit(socket.id, 20)) return;
            const page = data?.page;
            if (!isValidPage(page)) return;
            socket.to(PICTO_ROOM).emit('picto-cursor-hide', {
                id: socket.id,
                page
            });
        } catch (err) { console.error('picto-cursor-hide error:', err.message); } });

        // --- Pictochat Stroke Segment ---
        socket.on('picto-stroke-segment', (data) => { try {
            if (!checkRateLimit(socket.id, 30)) return;
            if (!data || typeof data !== 'object') return;

            const page = data.page;
            if (!isValidPage(page)) return;

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
                    page,
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
                page,
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

            const page = data.page;
            if (!isValidPage(page)) return;

            const strokeId = typeof data.strokeId === 'string' ? data.strokeId : '';
            const stroke = pictoState.inProgress.get(strokeId);
            if (!stroke || stroke.authorId !== socket.id) return;

            pictoState.inProgress.delete(strokeId);
            pictoState.pages[page].strokes.push(stroke);
            trimStrokes(page);

            const redo = getRedoStack(socket.id, page);
            redo.length = 0;

            io.to(PICTO_ROOM).emit('picto-stroke-commit', {
                strokeId: stroke.strokeId,
                authorId: stroke.authorId,
                page,
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

            const page = data.page;
            if (!isValidPage(page)) return;

            const tool = ['line', 'rect', 'circle'].includes(data.tool) ? data.tool : null;
            if (!tool) return;

            const start = normalizePoint(data.start);
            const end = normalizePoint(data.end);
            if (!start || !end) return;

            const stroke = {
                strokeId: `${socket.id}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                authorId: socket.id,
                authorName: getPictoName(socket.id),
                page,
                tool,
                color: sanitizeColor(data.color),
                size: sanitizeSize(data.size),
                start,
                end
            };

            pictoState.pages[page].strokes.push(stroke);
            trimStrokes(page);

            const redo = getRedoStack(socket.id, page);
            redo.length = 0;

            io.to(PICTO_ROOM).emit('picto-shape', stroke);
        } catch (err) { console.error('picto-shape error:', err.message); } });

        // --- Pictochat Undo ---
        socket.on('picto-undo', (data) => { try {
            if (!checkRateLimit(socket.id, 5)) return;
            if (!data || typeof data !== 'object') return;
            const page = data.page;
            if (!isValidPage(page)) return;

            const strokeId = typeof data.strokeId === 'string' ? data.strokeId : '';
            const strokes = pictoState.pages[page].strokes;
            const index = strokes.findIndex(s => s.strokeId === strokeId && s.authorId === socket.id);
            if (index === -1) return;

            const [removed] = strokes.splice(index, 1);
            getRedoStack(socket.id, page).push(removed);

            io.to(PICTO_ROOM).emit('picto-undo', {
                page,
                strokeId,
                byId: socket.id
            });
        } catch (err) { console.error('picto-undo error:', err.message); } });

        // --- Pictochat Redo ---
        socket.on('picto-redo', (data) => { try {
            if (!checkRateLimit(socket.id, 5)) return;
            if (!data || typeof data !== 'object') return;
            const page = data.page;
            if (!isValidPage(page)) return;

            const redo = getRedoStack(socket.id, page);
            if (!redo.length) return;

            const stroke = redo.pop();
            pictoState.pages[page].strokes.push(stroke);
            trimStrokes(page);

            io.to(PICTO_ROOM).emit('picto-redo', {
                page,
                stroke,
                byId: socket.id
            });
        } catch (err) { console.error('picto-redo error:', err.message); } });

        // --- Pictochat Clear ---
        socket.on('picto-clear', (data) => { try {
            if (!checkRateLimit(socket.id, 2)) return;
            if (!data || typeof data !== 'object') return;
            const page = data.page;
            if (!isValidPage(page)) return;

            pictoState.pages[page].strokes = [];
            getRedoStack(socket.id, page).length = 0;
            for (const [strokeId, stroke] of pictoState.inProgress.entries()) {
                if (stroke.page === page) pictoState.inProgress.delete(strokeId);
            }

            io.to(PICTO_ROOM).emit('picto-clear', {
                page,
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
            if (room.game) {
                socket.emit('error', { message: 'Spiel läuft bereits!' });
                return;
            }
            if (room.players.length >= 4) {
                socket.emit('error', { message: 'Raum ist voll (max. 4 Spieler)!' });
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
            socket.join(code);

            socket.emit('room-joined', { code });
            broadcastRoomState(io, room);
            broadcastLobbies(io, room.gameType);
            console.log(`${playerName} joined room ${code}`);
        } catch (err) { console.error('join-room error:', err.message); socket.emit('error', { message: 'Fehler beim Beitreten.' }); } });

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
                hasRolled: false
            };

            io.to(room.code).emit('game-started', {
                players: room.game.players.map(p => ({ name: p.name, lives: p.lives, character: p.character }))
            });

            sendTurnStart(io, room);
            broadcastLobbies(io, room.gameType);
            console.log(`Game started in ${room.code}`);
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
                io.to(room.code).emit('game-over', {
                    winnerName: alive[0]?.name || 'Niemand',
                    players: game.players.map(p => ({ name: p.name, lives: p.lives }))
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
                io.to(room.code).emit('game-over', {
                    winnerName: alive[0]?.name || 'Niemand',
                    players: game.players.map(p => ({ name: p.name, lives: p.lives }))
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

        // --- Leave Room ---
        socket.on('leave-room', () => { try {
            if (!checkRateLimit(socket.id)) return;
            const room = getRoom(socket.id);
            if (!room) return;

            const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
            if (playerIndex === -1) return;

            const playerName = room.players[playerIndex].name;
            console.log(`${playerName} left ${room.code}`);

            socket.leave(room.code);

            if (room.game) {
                const gamePlayer = room.game.players.find(p => p.socketId === socket.id);
                if (gamePlayer && gamePlayer.lives > 0) {
                    gamePlayer.lives = 0;

                    io.to(room.code).emit('player-disconnected', {
                        playerName,
                        players: room.game.players.map(p => ({ name: p.name, lives: p.lives }))
                    });

                    if (room.game.players[room.game.currentIndex].socketId === socket.id) {
                        room.game.currentIndex = nextAlivePlayerIndex(room.game, room.game.currentIndex);
                        room.game.previousAnnouncement = null;
                        room.game.isFirstTurn = true;
                    }

                    const alive = getAlivePlayers(room.game);
                    if (alive.length <= 1) {
                        io.to(room.code).emit('game-over', {
                            winnerName: alive[0]?.name || 'Niemand',
                            players: room.game.players.map(p => ({ name: p.name, lives: p.lives }))
                        });
                        room.game = null;
                    } else {
                        sendTurnStart(io, room);
                    }
                }
            }

            room.players.splice(playerIndex, 1);

            if (room.players.length === 0) {
                rooms.delete(room.code);
            } else {
                if (room.hostId === socket.id) {
                    room.hostId = room.players[0].socketId;
                }
                io.to(room.code).emit('room-update', {
                    players: room.players.map(p => ({
                        name: p.name,
                        isHost: p.socketId === room.hostId,
                        character: p.character
                    })),
                    hostId: room.hostId
                });
            }
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
            if (!room) return;

            const gameType = room.gameType;

            const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
            if (playerIndex === -1) return;

            const playerName = room.players[playerIndex].name;

            if (room.game) {
                const gamePlayer = room.game.players.find(p => p.socketId === socket.id);
                if (gamePlayer && gamePlayer.lives > 0) {
                    gamePlayer.lives = 0;

                    io.to(room.code).emit('player-disconnected', {
                        playerName,
                        players: room.game.players.map(p => ({ name: p.name, lives: p.lives }))
                    });

                    if (room.game.players[room.game.currentIndex].socketId === socket.id) {
                        room.game.currentIndex = nextAlivePlayerIndex(room.game, room.game.currentIndex);
                        room.game.previousAnnouncement = null;
                        room.game.isFirstTurn = true;
                    }

                    const alive = getAlivePlayers(room.game);
                    if (alive.length <= 1) {
                        io.to(room.code).emit('game-over', {
                            winnerName: alive[0]?.name || 'Niemand',
                            players: room.game.players.map(p => ({ name: p.name, lives: p.lives }))
                        });
                        room.game = null;
                    } else {
                        sendTurnStart(io, room);
                    }
                }
            }

            room.players.splice(playerIndex, 1);

            if (room.players.length === 0) {
                rooms.delete(room.code);
                broadcastLobbies(io, gameType);
                console.log(`Room ${room.code} deleted`);
                return;
            }

            if (room.hostId === socket.id) {
                room.hostId = room.players[0].socketId;
            }

            broadcastRoomState(io, room);
            broadcastLobbies(io, gameType);
            io.to(room.code).emit('player-left', { playerName });
            console.log(`${playerName} left ${room.code}`);
        } catch (err) { console.error('disconnect error:', err.message); } });
    });
}
