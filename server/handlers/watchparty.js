import { validateYouTubeId } from '../socket-utils.js';

export function registerWatchpartyHandlers(socket, io, deps) {
    const { checkRateLimit, getRoom } = deps;

    socket.on('watchparty-load', (videoId) => { try {
        if (!checkRateLimit(socket, 5)) return;
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

    socket.on('watchparty-playpause', (data) => { try {
        if (!checkRateLimit(socket, 5)) return;
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

    socket.on('watchparty-seek', (time) => { try {
        if (!checkRateLimit(socket, 5)) return;
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

    socket.on('watchparty-request-sync', () => { try {
        if (!checkRateLimit(socket)) return;

        const room = getRoom(socket.id);
        if (!room || room.gameType !== 'watchparty') return;
        if (!room.watchparty || !room.watchparty.videoId) return;

        socket.emit('watchparty-video', {
            videoId: room.watchparty.videoId,
            state: room.watchparty.state,
            time: room.watchparty.time
        });
    } catch (err) { console.error('watchparty-request-sync error:', err.message); } });
}
