import {
    updateBrainAgeLeaderboard,
    updateGameLeaderboard,
    getBrainLeaderboard,
    getGameLeaderboards,
    VALID_BRAIN_GAME_IDS
} from '../brain-leaderboards.js';
import { addBalance } from '../currency.js';
import {
    generateRoomCode,
    rooms,
    broadcastLobbies,
    getRoom,
    removePlayerFromRoom,
    socketToRoom
} from '../room-manager.js';
import { emitBalanceUpdate, sanitizeName, validateRoomCode } from '../socket-utils.js';
import { isDatabaseEnabled, query } from '../db.js';

const brainDailyCooldown = new Map(); // name -> dayNumber
let brainLeaderboardBroadcastTimer = null;
let brainGameLeaderboardsTimer = null;
const BRAIN_LEADERBOARD_THROTTLE_MS = 1000;

let _io = null;

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

export function registerBrainVersusHandlers(socket, io, deps) {
    _io = io;
    const { checkRateLimit } = deps;

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
}

export async function cleanupBrainVersusOnDisconnect(socket, room, io) {
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
}
