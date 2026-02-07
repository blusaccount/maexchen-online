import { getAlivePlayers, nextAlivePlayerIndex } from './game-logic.js';
import { addBalance, getBalance } from './currency.js';

// ============== ROOM MANAGEMENT ==============

export const rooms = new Map();
export const socketToRoom = new Map(); // socketId -> roomCode (O(1) lookup)

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
        // Show rooms that match game type and are either not started or are watch parties (joinable anytime)
        const isJoinable = !room.game || room.gameType === 'watchparty';
        if (isJoinable && room.gameType === gameType) {
            lobbies.push({
                code: code,
                hostName: room.players.find(p => p.socketId === room.hostId)?.name || 'Unknown',
                playerCount: room.players.length,
                maxPlayers: 6,
                started: !!room.game,
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
    const code = socketToRoom.get(socketId);
    if (code) {
        const room = rooms.get(code);
        if (room) return room;
        // Stale entry — clean up
        socketToRoom.delete(socketId);
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

// ============== REMOVE PLAYER FROM ROOM ==============
// Shared logic for leave-room and disconnect handlers

export async function removePlayerFromRoom(io, socketId, room) {
    const playerIndex = room.players.findIndex(p => p.socketId === socketId);
    if (playerIndex === -1) return;

    const playerName = room.players[playerIndex].name;
    const gameType = room.gameType;

    // Handle active game state
    if (room.game) {
        if (room.gameType === 'watchparty') {
            const gpIdx = room.game.players.findIndex(p => p.socketId === socketId);
            if (gpIdx !== -1) {
                room.game.players.splice(gpIdx, 1);
            }
            io.to(room.code).emit('player-disconnected', {
                playerName,
                players: room.game.players.map(p => ({ name: p.name, lives: p.lives }))
            });
        } else {
            const gamePlayer = room.game.players.find(p => p.socketId === socketId);
            if (gamePlayer && gamePlayer.lives > 0) {
                gamePlayer.lives = 0;

                io.to(room.code).emit('player-disconnected', {
                    playerName,
                    players: room.game.players.map(p => ({ name: p.name, lives: p.lives }))
                });

                if (room.game.players[room.game.currentIndex].socketId === socketId) {
                    room.game.currentIndex = nextAlivePlayerIndex(room.game, room.game.currentIndex);
                    room.game.previousAnnouncement = null;
                    room.game.isFirstTurn = true;
                }

                const alive = getAlivePlayers(room.game);
                if (alive.length <= 1) {
                    const winnerName = alive[0]?.name || 'Niemand';
                    const pot = room.game.pot || 0;

                    // Award pot to winner
                    if (pot > 0 && alive[0]) {
                        await addBalance(alive[0].name, pot, 'maexchen_pot_win', { roomCode: room.code });
                        for (const p of room.players) {
                            const balance = await getBalance(p.name);
                            io.to(p.socketId).emit('balance-update', { balance });
                        }
                    }

                    io.to(room.code).emit('game-over', {
                        winnerName,
                        players: room.game.players.map(p => ({ name: p.name, lives: p.lives })),
                        pot
                    });
                    room.game = null;
                } else {
                    sendTurnStart(io, room);
                }
            }
        }
    }

    // Remove from room players
    room.players.splice(playerIndex, 1);
    socketToRoom.delete(socketId);

    // Clean up bet for leaving player and reset requiredBet if no bets remain
    if (room.bets) {
        delete room.bets[socketId];
        const anyBets = room.players.some(p => (room.bets[p.socketId] || 0) > 0);
        if (!anyBets) {
            room.requiredBet = 0;
        }
        if (!room.game && room.players.length > 0) {
            const betsInfo = room.players.map(p => ({
                name: p.name,
                bet: room.bets[p.socketId] || 0
            }));
            io.to(room.code).emit('bets-update', { bets: betsInfo, requiredBet: room.requiredBet || 0 });
        }
    }

    // Delete empty room or reassign host
    if (room.players.length === 0) {
        rooms.delete(room.code);
        broadcastLobbies(io, gameType);
        console.log(`Room ${room.code} deleted`);
    } else {
        if (room.hostId === socketId) {
            room.hostId = room.players[0].socketId;
        }
        broadcastRoomState(io, room);
        broadcastLobbies(io, gameType);
        io.to(room.code).emit('player-left', { playerName });
    }

    console.log(`${playerName} left ${room.code}`);
    return playerName;
}
