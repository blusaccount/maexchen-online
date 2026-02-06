import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

// ============== DISCORD BOT IMPORTS ==============
import { Client, GatewayIntentBits, Collection, Events } from 'discord.js';
import { readdirSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/shared', express.static(path.join(__dirname, 'shared')));
app.use('/games', express.static(path.join(__dirname, 'games')));

// ============== GAME CONSTANTS ==============

// Dice value encoding: higher die as tens digit (e.g., roll 3+1 = 31)
// ROLL_ORDER: normals (31-65) < pasches (11-66) < Mäxchen (21)
const ROLL_ORDER = [
    31, 32, 41, 42, 43, 51, 52, 53, 54, 61, 62, 63, 64, 65, // Normale
    11, 22, 33, 44, 55, 66, // Pasches
    21 // Mäxchen
];

const STARTING_LIVES = 3;

// ============== HELPER FUNCTIONS ==============

function rollRank(val) {
    return ROLL_ORDER.indexOf(val);
}

function rollName(val) {
    if (val === 21) return 'Mäxchen!';
    const d1 = Math.floor(val / 10);
    const d2 = val % 10;
    if (d1 === d2) return `Pasch ${d1}er`;
    return String(val);
}

function rollDice() {
    const a = Math.floor(Math.random() * 6) + 1;
    const b = Math.floor(Math.random() * 6) + 1;
    const high = Math.max(a, b);
    const low = Math.min(a, b);
    return { d1: high, d2: low, value: high * 10 + low };
}

function isMaexchen(val) {
    return val === 21;
}

// ============== ROOM MANAGEMENT ==============

const rooms = new Map();

// Track all online players globally
const onlinePlayers = new Map(); // socketId -> { name, character, game }

// Broadcast online players to all clients
function broadcastOnlinePlayers() {
    const players = Array.from(onlinePlayers.values());
    io.emit('online-players', players);
}

// Get open lobbies for a specific game
function getOpenLobbies(gameType) {
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
function broadcastLobbies(gameType) {
    const lobbies = getOpenLobbies(gameType);
    io.emit('lobbies-update', { gameType, lobbies });
}

function generateRoomCode() {
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

function getRoom(socketId) {
    for (const [code, room] of rooms) {
        if (room.players.some(p => p.socketId === socketId)) {
            return room;
        }
    }
    return null;
}

function broadcastRoomState(room) {
    io.to(room.code).emit('room-update', {
        players: room.players.map(p => ({
            name: p.name,
            isHost: p.socketId === room.hostId,
            character: p.character
        })),
        hostId: room.hostId
    });
}

// ============== GAME LOGIC ==============

function getAlivePlayers(game) {
    return game.players.filter(p => p.lives > 0);
}

function nextAlivePlayerIndex(game, fromIndex) {
    let idx = fromIndex;
    let safety = 0;
    do {
        idx = (idx + 1) % game.players.length;
        safety++;
    } while (game.players[idx].lives <= 0 && safety < game.players.length);
    return idx;
}

function sendTurnStart(room) {
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

// ============== SOCKET HANDLERS ==============

io.on('connection', (socket) => {
    console.log(`Connected: ${socket.id}`);

    // Send current online players to new connection
    socket.emit('online-players', Array.from(onlinePlayers.values()));

    // --- Register Player (when they enter their name) ---
    socket.on('register-player', ({ name, character, game }) => {
        onlinePlayers.set(socket.id, { name, character, game });
        broadcastOnlinePlayers();
        console.log(`Registered: ${name} for ${game}`);
    });

    // --- Request Lobbies ---
    socket.on('get-lobbies', (gameType) => {
        const lobbies = getOpenLobbies(gameType);
        socket.emit('lobbies-update', { gameType, lobbies });
    });

    // --- Create Room ---
    socket.on('create-room', (data) => {
        // Support both old (string) and new (object) format
        const playerName = typeof data === 'string' ? data : data.playerName;
        const character = typeof data === 'object' ? data.character : null;
        const gameType = typeof data === 'object' ? data.gameType : 'maexchen';

        const code = generateRoomCode();
        const room = {
            code,
            hostId: socket.id,
            gameType: gameType,
            players: [{
                socketId: socket.id,
                name: playerName || 'Spieler 1',
                character: character
            }],
            game: null
        };
        rooms.set(code, room);
        socket.join(code);

        socket.emit('room-created', { code });
        broadcastRoomState(room);
        broadcastLobbies(gameType); // Notify others about new lobby
        console.log(`Room ${code} created by ${playerName}`);
    });

    // --- Join Room ---
    socket.on('join-room', (data) => {
        const code = (data.code || '').toUpperCase().trim();
        const playerName = data.playerName;
        const character = data.character || null;

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

        room.players.push({
            socketId: socket.id,
            name: playerName || `Spieler ${room.players.length + 1}`,
            character: character
        });
        socket.join(code);

        socket.emit('room-joined', { code });
        broadcastRoomState(room);
        broadcastLobbies(room.gameType); // Update lobby list
        console.log(`${playerName} joined room ${code}`);
    });

    // --- Start Game ---
    socket.on('start-game', () => {
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

        sendTurnStart(room);
        broadcastLobbies(room.gameType); // Remove from open lobbies
        console.log(`Game started in ${room.code}`);
    });

    // --- Roll Dice ---
    socket.on('roll', () => {
        const room = getRoom(socket.id);
        if (!room || !room.game) return;
        const game = room.game;

        const currentPlayer = game.players[game.currentIndex];
        if (currentPlayer.socketId !== socket.id) return;
        if (game.hasRolled) return;

        // Can't roll if Mäxchen was announced (must challenge or believe)
        if (!game.isFirstTurn && game.previousAnnouncement && isMaexchen(game.previousAnnouncement.value)) {
            socket.emit('error', { message: 'Mäxchen! Du musst anzweifeln oder glauben.' });
            return;
        }

        game.currentRoll = rollDice();
        game.hasRolled = true;

        // Tell everyone dice were rolled
        io.to(room.code).emit('dice-rolled', {
            playerName: currentPlayer.name
        });

        // Send actual values only to roller
        socket.emit('roll-result', {
            d1: game.currentRoll.d1,
            d2: game.currentRoll.d2,
            value: game.currentRoll.value,
            name: rollName(game.currentRoll.value)
        });

        console.log(`${currentPlayer.name} rolled ${game.currentRoll.value}`);
    });

    // --- Announce ---
    socket.on('announce', (value) => {
        const room = getRoom(socket.id);
        if (!room || !room.game) return;
        const game = room.game;

        const currentPlayer = game.players[game.currentIndex];
        if (currentPlayer.socketId !== socket.id) return;
        if (!game.hasRolled) return;

        // Validate value
        if (!ROLL_ORDER.includes(value)) {
            socket.emit('error', { message: 'Ungültiger Wert!' });
            return;
        }

        // Must be higher than previous
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

        // Next player
        game.currentIndex = nextAlivePlayerIndex(game, game.currentIndex);
        sendTurnStart(room);

        console.log(`${currentPlayer.name} announced ${rollName(value)}`);
    });

    // --- Challenge ---
    socket.on('challenge', () => {
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

        // Check game over
        const alive = getAlivePlayers(game);
        if (alive.length <= 1) {
            io.to(room.code).emit('game-over', {
                winnerName: alive[0]?.name || 'Niemand',
                players: game.players.map(p => ({ name: p.name, lives: p.lives }))
            });
            room.game = null;
            return;
        }

        // New round - loser starts (or next alive if eliminated)
        game.currentIndex = game.players[loserIndex].lives > 0
            ? loserIndex
            : nextAlivePlayerIndex(game, loserIndex);
        game.previousAnnouncement = null;
        game.isFirstTurn = true;

        setTimeout(() => sendTurnStart(room), 3000);
    });

    // --- Believe Mäxchen ---
    socket.on('believe-maexchen', () => {
        const room = getRoom(socket.id);
        if (!room || !room.game) return;
        const game = room.game;

        const believer = game.players[game.currentIndex];
        if (believer.socketId !== socket.id) return;
        if (!game.previousAnnouncement || !isMaexchen(game.previousAnnouncement.value)) return;

        const actual = game.previousAnnouncement.actualRoll;
        const wasRealMaexchen = isMaexchen(actual.value);

        // Believer loses 2 lives regardless
        game.players[game.currentIndex].lives = Math.max(0, game.players[game.currentIndex].lives - 2);

        io.to(room.code).emit('maexchen-believed', {
            believerName: believer.name,
            actualRoll: actual,
            actualName: rollName(actual.value),
            wasRealMaexchen,
            players: game.players.map(p => ({ name: p.name, lives: p.lives }))
        });

        // Check game over
        const alive = getAlivePlayers(game);
        if (alive.length <= 1) {
            io.to(room.code).emit('game-over', {
                winnerName: alive[0]?.name || 'Niemand',
                players: game.players.map(p => ({ name: p.name, lives: p.lives }))
            });
            room.game = null;
            return;
        }

        // Believer starts new round (or next if eliminated)
        game.currentIndex = believer.lives > 0
            ? game.currentIndex
            : nextAlivePlayerIndex(game, game.currentIndex);
        game.previousAnnouncement = null;
        game.isFirstTurn = true;

        setTimeout(() => sendTurnStart(room), 3000);
    });

    // --- Emote ---
    socket.on('emote', (emoteId) => {
        const room = getRoom(socket.id);
        if (!room) return;

        const player = room.players.find(p => p.socketId === socket.id);
        if (!player) return;

        io.to(room.code).emit('emote-broadcast', {
            playerName: player.name,
            emoteId: emoteId
        });
    });

    // --- Chat Message ---
    socket.on('chat-message', (text) => {
        const room = getRoom(socket.id);
        if (!room) return;

        const player = room.players.find(p => p.socketId === socket.id);
        if (!player) return;

        // Sanitize and limit message
        const sanitizedText = String(text).slice(0, 100).trim();
        if (!sanitizedText) return;

        io.to(room.code).emit('chat-broadcast', {
            playerName: player.name,
            text: sanitizedText,
            timestamp: Date.now()
        });

        console.log(`[Chat ${room.code}] ${player.name}: ${sanitizedText}`);
    });

    // --- Drawing Note ---
    socket.on('drawing-note', ({ dataURL, target }) => {
        const room = getRoom(socket.id);
        if (!room) return;

        const player = room.players.find(p => p.socketId === socket.id);
        if (!player) return;

        // Validate dataURL (basic check)
        if (!dataURL || typeof dataURL !== 'string' || !dataURL.startsWith('data:image/')) {
            return;
        }

        // Limit dataURL size (max ~50KB)
        if (dataURL.length > 70000) return;

        if (target === 'all') {
            // Send to all players except sender
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
            // Send to specific player
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
    });

    // --- Leave Room ---
    socket.on('leave-room', () => {
        const room = getRoom(socket.id);
        if (!room) return;

        const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
        if (playerIndex === -1) return;

        const playerName = room.players[playerIndex].name;
        console.log(`${playerName} left ${room.code}`);

        // Leave socket room
        socket.leave(room.code);

        // If game running, eliminate player
        if (room.game) {
            const gamePlayer = room.game.players.find(p => p.socketId === socket.id);
            if (gamePlayer && gamePlayer.lives > 0) {
                gamePlayer.lives = 0;

                io.to(room.code).emit('player-disconnected', {
                    playerName,
                    players: room.game.players.map(p => ({ name: p.name, lives: p.lives }))
                });

                // If it was their turn, advance
                if (room.game.players[room.game.currentIndex].socketId === socket.id) {
                    room.game.currentIndex = nextAlivePlayerIndex(room.game, room.game.currentIndex);
                    room.game.previousAnnouncement = null;
                    room.game.isFirstTurn = true;
                }

                // Check game over
                const alive = getAlivePlayers(room.game);
                if (alive.length <= 1) {
                    io.to(room.code).emit('game-over', {
                        winnerName: alive[0]?.name || 'Niemand',
                        players: room.game.players.map(p => ({ name: p.name, lives: p.lives }))
                    });
                    room.game = null;
                } else {
                    sendTurnStart(room);
                }
            }
        }

        // Remove from room
        room.players.splice(playerIndex, 1);

        if (room.players.length === 0) {
            rooms.delete(room.code);
        } else {
            // Reassign host if needed
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
    });

    // --- Disconnect ---
    socket.on('disconnect', () => {
        // Remove from online players
        onlinePlayers.delete(socket.id);
        broadcastOnlinePlayers();

        const room = getRoom(socket.id);
        if (!room) return;

        const gameType = room.gameType;

        const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
        if (playerIndex === -1) return;

        const playerName = room.players[playerIndex].name;

        // If game running, eliminate player
        if (room.game) {
            const gamePlayer = room.game.players.find(p => p.socketId === socket.id);
            if (gamePlayer && gamePlayer.lives > 0) {
                gamePlayer.lives = 0;

                io.to(room.code).emit('player-disconnected', {
                    playerName,
                    players: room.game.players.map(p => ({ name: p.name, lives: p.lives }))
                });

                // If it was their turn, advance
                if (room.game.players[room.game.currentIndex].socketId === socket.id) {
                    room.game.currentIndex = nextAlivePlayerIndex(room.game, room.game.currentIndex);
                    room.game.previousAnnouncement = null;
                    room.game.isFirstTurn = true;
                }

                // Check game over
                const alive = getAlivePlayers(room.game);
                if (alive.length <= 1) {
                    io.to(room.code).emit('game-over', {
                        winnerName: alive[0]?.name || 'Niemand',
                        players: room.game.players.map(p => ({ name: p.name, lives: p.lives }))
                    });
                    room.game = null;
                } else {
                    sendTurnStart(room);
                }
            }
        }

        // Remove from room
        room.players.splice(playerIndex, 1);

        if (room.players.length === 0) {
            rooms.delete(room.code);
            broadcastLobbies(gameType);
            console.log(`Room ${room.code} deleted`);
            return;
        }

        // Reassign host if needed
        if (room.hostId === socket.id) {
            room.hostId = room.players[0].socketId;
        }

        broadcastRoomState(room);
        broadcastLobbies(gameType);
        io.to(room.code).emit('player-left', { playerName });
        console.log(`${playerName} left ${room.code}`);
    });
});

// ============== DISCORD BOT ==============

async function startDiscordBot() {
    // Nur starten wenn Token vorhanden
    if (!process.env.DISCORD_TOKEN) {
        console.log('⚠ DISCORD_TOKEN nicht gesetzt - Bot wird nicht gestartet');
        return;
    }

    const sodium = require('libsodium-wrappers');
    await sodium.ready;
    console.log('✓ Sodium geladen');

    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildVoiceStates,
        ]
    });

    client.commands = new Collection();

    // Commands laden
    const commandsPath = path.join(__dirname, 'bot', 'src', 'commands');
    try {
        const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = await import(`file://${filePath}`);
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                console.log(`✓ Command geladen: ${command.data.name}`);
            }
        }
    } catch (err) {
        console.log('⚠ Bot-Commands nicht gefunden:', err.message);
        return;
    }

    // Command Handler
    client.on(Events.InteractionCreate, async interaction => {
        if (!interaction.isChatInputCommand()) return;

        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`Fehler bei Command ${interaction.commandName}:`, error);
            try {
                const reply = { content: '❌ Fehler beim Ausführen des Commands!', flags: 64 };
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(reply);
                } else {
                    await interaction.reply(reply);
                }
            } catch (e) {
                // Interaction bereits abgelaufen
            }
        }
    });

    process.on('unhandledRejection', error => {
        console.error('Unhandled promise rejection:', error);
    });

    client.once(Events.ClientReady, c => {
        console.log(`✓ Discord Bot online als ${c.user.tag}`);
    });

    await client.login(process.env.DISCORD_TOKEN);
}

// ============== START SERVER ==============

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
    console.log(`✓ StrictHotel Server: http://localhost:${PORT}`);

    // Discord Bot starten
    try {
        await startDiscordBot();
    } catch (err) {
        console.error('Discord Bot Fehler:', err.message);
    }
});
