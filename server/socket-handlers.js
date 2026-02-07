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
    const allowed = ['maexchen', 'lobby'];
    const clean = gameType.replace(/[^a-z]/g, '').slice(0, 20);
    return allowed.includes(clean) ? clean : 'maexchen';
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
            if (room.players.length < 2) {
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
