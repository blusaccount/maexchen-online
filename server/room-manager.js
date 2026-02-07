// ============== ROOM MANAGEMENT ==============

export const rooms = new Map();

// Track all online players globally
export const onlinePlayers = new Map(); // socketId -> { name, character, game }

// Broadcast online players to all clients
export function broadcastOnlinePlayers(io) {
    const players = Array.from(onlinePlayers.values());
    io.emit('online-players', players);
}

// Get open lobbies for a specific game
export function getOpenLobbies(gameType) {
    const lobbies = [];
    for (const [code, room] of rooms) {
        // Only show rooms that haven't started and match the game type
        if (!room.game && room.gameType === gameType) {
            lobbies.push({
                code: code,
                hostName: room.players.find(p => p.socketId === room.hostId)?.name || 'Unknown',
                playerCount: room.players.length,
                maxPlayers: 6,
                players: room.players.map(p => ({
                    name: p.name,
                    character: p.character
                }))
            });
        }
    }
    return lobbies;
}

// Broadcast lobbies to clients in a specific game
export function broadcastLobbies(io, gameType) {
    const lobbies = getOpenLobbies(gameType);
    io.emit('lobbies-update', { gameType, lobbies });
}

export function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do {
        code = '';
        for (let i = 0; i < 4; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
    } while (rooms.has(code));
    return code;
}

export function getRoom(socketId) {
    for (const [code, room] of rooms) {
        if (room.players.some(p => p.socketId === socketId)) {
            return room;
        }
    }
    return null;
}

export function broadcastRoomState(io, room) {
    io.to(room.code).emit('room-update', {
        players: room.players.map(p => ({
            name: p.name,
            isHost: p.socketId === room.hostId,
            character: p.character
        })),
        hostId: room.hostId
    });
}

export function sendTurnStart(io, room) {
    const game = room.game;
    const currentPlayer = game.players[game.currentIndex];

    io.to(room.code).emit('turn-start', {
        currentPlayerIndex: game.currentIndex,
        currentPlayerName: currentPlayer.name,
        previousAnnouncement: game.previousAnnouncement,
        isFirstTurn: game.isFirstTurn,
        players: game.players.map(p => ({ name: p.name, lives: p.lives, character: p.character }))
    });

    // Reset turn state
    game.currentRoll = null;
    game.hasRolled = false;
}
