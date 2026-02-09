import {
    ROLL_ORDER, STARTING_LIVES,
    rollRank, rollName, rollDice, isMaexchen,
    getAlivePlayers, nextAlivePlayerIndex
} from '../game-logic.js';
import { getRoom, sendTurnStart, awardPotAndEndGame } from '../room-manager.js';
import { getBalance, deductBalance } from '../currency.js';
import { emitBalanceUpdate } from '../socket-utils.js';

export function registerMaexchenHandlers(socket, io, deps) {
    const { checkRateLimit, broadcastLobbies } = deps;

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
}
