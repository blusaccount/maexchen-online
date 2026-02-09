const SOUNDBOARD_ROOM = 'lobby-soundboard';
const SOUNDBOARD_VALID_IDS = new Set([
    'anatolia', 'elgato', 'fahh', 'massenhausen', 'plug',
    'reverbfart', 'rizz', 'seyuh', 'vineboom'
]);

function getPlayerName(socketId, onlinePlayers) {
    const entry = onlinePlayers.get(socketId);
    return entry?.name || 'Anon';
}

export function registerSoundboardHandlers(socket, io, deps) {
    const { checkRateLimit, onlinePlayers } = deps;

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
            playerName: getPlayerName(socket.id, onlinePlayers),
            timestamp: Date.now()
        });
    } catch (err) { console.error('soundboard-play error:', err.message); } });
}
