import {
    validateGameType,
    validateRoomCode,
    sanitizeName,
    validateCharacter
} from '../socket-utils.js';

import {
    getOpenLobbies,
    generateRoomCode,
    rooms,
    broadcastLobbies,
    getRoom,
    broadcastRoomState,
    removePlayerFromRoom,
    socketToRoom
} from '../room-manager.js';

export function registerLobbyHandlers(socket, io, { checkRateLimit }) {
    // --- Get Lobbies ---
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

    // --- Leave Room ---
    socket.on('leave-room', async () => { try {
        if (!checkRateLimit(socket)) return;
        const room = getRoom(socket.id);
        if (!room) return;

        socket.leave(room.code);
        await removePlayerFromRoom(io, socket.id, room);
    } catch (err) { console.error('leave-room error:', err.message); } });
}
