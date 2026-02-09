import { validateYouTubeId } from '../socket-utils.js';

const CLUB_ROOM = 'strict-club';
const clubState = {
    videoId: null,
    title: null,
    queuedBy: null,
    isPlaying: false,
    startedAt: null,
    queue: [],              // { videoId, title, queuedBy }
    listeners: new Map() // socketId -> name
};

export function registerStrictClubHandlers(socket, io, { checkRateLimit, onlinePlayers }) {
    socket.on('club-join', () => { try {
        if (!checkRateLimit(socket, 5)) return;

        const player = onlinePlayers.get(socket.id);
        const playerName = player?.name || 'Guest';

        socket.join(CLUB_ROOM);
        clubState.listeners.set(socket.id, playerName);

        // Send current state to the joining user
        socket.emit('club-sync', {
            videoId: clubState.videoId,
            title: clubState.title,
            queuedBy: clubState.queuedBy,
            isPlaying: clubState.isPlaying,
            queue: clubState.queue,
            listeners: Array.from(clubState.listeners.values())
        });

        // Broadcast updated listener list to all
        io.to(CLUB_ROOM).emit('club-listeners', {
            listeners: Array.from(clubState.listeners.values())
        });

        console.log(`[StrictClub] ${playerName} joined (${clubState.listeners.size} listeners)`);
    } catch (err) { console.error('club-join error:', err.message); } });

    socket.on('club-leave', () => { try {
        if (!checkRateLimit(socket, 5)) return;

        const playerName = clubState.listeners.get(socket.id) || 'Guest';
        socket.leave(CLUB_ROOM);
        clubState.listeners.delete(socket.id);

        // Broadcast updated listener list
        io.to(CLUB_ROOM).emit('club-listeners', {
            listeners: Array.from(clubState.listeners.values())
        });

        console.log(`[StrictClub] ${playerName} left (${clubState.listeners.size} listeners)`);
    } catch (err) { console.error('club-leave error:', err.message); } });

    socket.on('club-queue', (videoId) => { try {
        if (!checkRateLimit(socket, 3)) return;

        const id = validateYouTubeId(videoId);
        if (!id) return;

        const player = onlinePlayers.get(socket.id);
        const playerName = player?.name || 'Guest';

        const entry = { videoId: id, title: 'YouTube Track', queuedBy: playerName };

        if (!clubState.videoId) {
            // Nothing playing — start immediately
            clubState.videoId = entry.videoId;
            clubState.title = entry.title;
            clubState.queuedBy = entry.queuedBy;
            clubState.isPlaying = true;
            clubState.startedAt = Date.now();

            io.to(CLUB_ROOM).emit('club-play', {
                videoId: entry.videoId,
                title: entry.title,
                queuedBy: entry.queuedBy
            });
        } else {
            // Something is playing — add to queue (max 20 entries)
            if (clubState.queue.length < 20) {
                clubState.queue.push(entry);
            }
        }

        // Broadcast updated queue to all listeners
        io.to(CLUB_ROOM).emit('club-queue-update', {
            queue: clubState.queue
        });

        console.log(`[StrictClub] ${playerName} queued: ${id}`);
    } catch (err) { console.error('club-queue error:', err.message); } });

    socket.on('club-pause', (shouldPlay) => { try {
        if (!checkRateLimit(socket, 5)) return;
        if (!clubState.videoId) return;

        clubState.isPlaying = !!shouldPlay;

        const player = onlinePlayers.get(socket.id);
        const playerName = player?.name || 'Guest';

        // Broadcast to all listeners
        io.to(CLUB_ROOM).emit('club-pause', {
            isPlaying: clubState.isPlaying
        });

        console.log(`[StrictClub] ${playerName} ${clubState.isPlaying ? 'resumed' : 'paused'}`);
    } catch (err) { console.error('club-pause error:', err.message); } });

    socket.on('club-skip', () => { try {
        if (!checkRateLimit(socket, 3)) return;

        const player = onlinePlayers.get(socket.id);
        const playerName = player?.name || 'Guest';

        // Play next from queue or clear
        const next = clubState.queue.shift();
        if (next) {
            clubState.videoId = next.videoId;
            clubState.title = next.title;
            clubState.queuedBy = next.queuedBy;
            clubState.isPlaying = true;
            clubState.startedAt = Date.now();

            io.to(CLUB_ROOM).emit('club-play', {
                videoId: next.videoId,
                title: next.title,
                queuedBy: next.queuedBy
            });
        } else {
            clubState.videoId = null;
            clubState.title = null;
            clubState.queuedBy = null;
            clubState.isPlaying = false;
            clubState.startedAt = null;
        }

        // Broadcast updated state and queue to all
        io.to(CLUB_ROOM).emit('club-sync', {
            videoId: clubState.videoId,
            title: clubState.title,
            queuedBy: clubState.queuedBy,
            isPlaying: clubState.isPlaying,
            queue: clubState.queue,
            listeners: Array.from(clubState.listeners.values())
        });

        io.to(CLUB_ROOM).emit('club-queue-update', {
            queue: clubState.queue
        });

        console.log(`[StrictClub] ${playerName} skipped track`);
    } catch (err) { console.error('club-skip error:', err.message); } });
}

export function cleanupClubOnDisconnect(socketId, io) {
    if (clubState.listeners.has(socketId)) {
        clubState.listeners.delete(socketId);
        io.to(CLUB_ROOM).emit('club-listeners', {
            listeners: Array.from(clubState.listeners.values())
        });
    }
}
