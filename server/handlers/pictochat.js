import { loadStrokes, saveStroke, deleteStroke, clearStrokes, loadMessages, saveMessage, clearMessages, PICTO_MAX_MESSAGES } from '../pictochat-store.js';
import { normalizePoint, sanitizeColor, sanitizeSize } from '../socket-utils.js';

const PICTO_ROOM = 'lobby-picto';
const PICTO_MAX_STROKES = 400;
const PICTO_MAX_POINTS = 800;
const PICTO_MAX_POINTS_PER_SEGMENT = 20;

const pictoState = {
    strokes: [],
    inProgress: new Map(), // strokeId -> stroke
    redoStacks: new Map(), // socketId -> stroke[]
    messages: [],          // recent messages for join replay
    hydrated: false,       // whether DB state has been loaded
    hydrationPromise: null
};

function sanitizePoints(points) {
    if (!Array.isArray(points)) return [];
    const clean = [];
    for (const p of points.slice(0, PICTO_MAX_POINTS_PER_SEGMENT)) {
        const norm = normalizePoint(p);
        if (norm) clean.push(norm);
    }
    return clean;
}

function getPictoName(socketId, onlinePlayers) {
    const entry = onlinePlayers.get(socketId);
    return entry?.name || 'Anon';
}

function getRedoStack(socketId) {
    if (!pictoState.redoStacks.has(socketId)) {
        pictoState.redoStacks.set(socketId, []);
    }
    return pictoState.redoStacks.get(socketId);
}

function trimStrokes() {
    const strokes = pictoState.strokes;
    if (strokes.length > PICTO_MAX_STROKES) {
        strokes.splice(0, strokes.length - PICTO_MAX_STROKES);
    }
}

function cleanupPictoForSocket(socketId, io) {
    pictoState.redoStacks.delete(socketId);
    for (const [strokeId, stroke] of pictoState.inProgress.entries()) {
        if (stroke.authorId === socketId) {
            pictoState.inProgress.delete(strokeId);
            // Commit in-progress strokes so they don't vanish for other clients
            if (stroke.points && stroke.points.length > 0) {
                pictoState.strokes.push(stroke);
                trimStrokes();
                if (io) {
                    io.to(PICTO_ROOM).emit('picto-stroke-commit', {
                        strokeId: stroke.strokeId,
                        authorId: stroke.authorId,
                        tool: stroke.tool,
                        color: stroke.color,
                        size: stroke.size,
                        points: stroke.points
                    });
                }
                saveStroke(stroke).catch(err => {
                    console.error('saveStroke cleanup error:', err.message);
                });
            }
        }
    }
}

export function registerPictochatHandlers(socket, io, { checkRateLimit, onlinePlayers }) {
    socket.on('picto-join', async () => { try {
        if (!checkRateLimit(socket)) return;
        socket.join(PICTO_ROOM);

        // On first join (empty in-memory state), hydrate from DB
        if (pictoState.strokes.length === 0 && !pictoState.hydrated && !pictoState.hydrationPromise) {
            pictoState.hydrationPromise = (async () => {
                const dbStrokes = await loadStrokes();
                if (dbStrokes.length > 0) {
                    pictoState.strokes = dbStrokes;
                }
                const dbMessages = await loadMessages();
                if (dbMessages.length > 0) {
                    pictoState.messages = dbMessages;
                }
                pictoState.hydrated = true;
            })();
        }

        // Wait for any in-flight hydration before sending state
        if (pictoState.hydrationPromise) {
            await pictoState.hydrationPromise;
            pictoState.hydrationPromise = null;
        }

        socket.emit('picto-state', {
            strokes: pictoState.strokes,
            messages: pictoState.messages || []
        });
    } catch (err) { console.error('picto-join error:', err.message); } });

    // --- Pictochat Cursor ---
    socket.on('picto-cursor', (data) => { try {
        if (!checkRateLimit(socket, 40)) return;
        if (!data || typeof data !== 'object') return;
        const point = normalizePoint({ x: data.x, y: data.y });
        if (!point) return;
        socket.to(PICTO_ROOM).emit('picto-cursor', {
            id: socket.id,
            name: getPictoName(socket.id, onlinePlayers),
            x: point.x,
            y: point.y
        });
    } catch (err) { console.error('picto-cursor error:', err.message); } });

    socket.on('picto-cursor-hide', () => { try {
        if (!checkRateLimit(socket, 20)) return;
        socket.to(PICTO_ROOM).emit('picto-cursor-hide', {
            id: socket.id
        });
    } catch (err) { console.error('picto-cursor-hide error:', err.message); } });

    // --- Pictochat Stroke Segment ---
    socket.on('picto-stroke-segment', (data) => { try {
        if (!checkRateLimit(socket, 30)) return;
        if (!data || typeof data !== 'object') return;

        const tool = data.tool === 'eraser' ? 'eraser' : 'pen';
        const color = sanitizeColor(data.color);
        const size = sanitizeSize(data.size);
        const strokeId = typeof data.strokeId === 'string' && data.strokeId.length < 80
            ? data.strokeId
            : null;
        if (!strokeId) return;

        const points = sanitizePoints(data.points);
        if (!points.length) return;

        let stroke = pictoState.inProgress.get(strokeId);
        if (!stroke) {
            stroke = {
                strokeId,
                authorId: socket.id,
                authorName: getPictoName(socket.id, onlinePlayers),
                tool,
                color,
                size,
                points: []
            };
            pictoState.inProgress.set(strokeId, stroke);
        }

        if (stroke.points.length + points.length > PICTO_MAX_POINTS) return;
        stroke.points.push(...points);

        socket.to(PICTO_ROOM).emit('picto-stroke-segment', {
            strokeId,
            tool,
            color,
            size,
            points
        });
    } catch (err) { console.error('picto-stroke-segment error:', err.message); } });

    // --- Pictochat Stroke End ---
    socket.on('picto-stroke-end', async (data) => { try {
        if (!checkRateLimit(socket, 10)) return;
        if (!data || typeof data !== 'object') return;

        const strokeId = typeof data.strokeId === 'string' ? data.strokeId : '';
        const stroke = pictoState.inProgress.get(strokeId);
        if (!stroke || stroke.authorId !== socket.id) return;

        pictoState.inProgress.delete(strokeId);
        pictoState.strokes.push(stroke);
        trimStrokes();

        const redo = getRedoStack(socket.id);
        redo.length = 0;

        io.to(PICTO_ROOM).emit('picto-stroke-commit', {
            strokeId: stroke.strokeId,
            authorId: stroke.authorId,
            tool: stroke.tool,
            color: stroke.color,
            size: stroke.size,
            points: stroke.points
        });

        await saveStroke(stroke);
    } catch (err) { console.error('picto-stroke-end error:', err.message); } });

    // --- Pictochat Shape ---
    socket.on('picto-shape', async (data) => { try {
        if (!checkRateLimit(socket, 8)) return;
        if (!data || typeof data !== 'object') return;

        const tool = ['line', 'rect', 'circle'].includes(data.tool) ? data.tool : null;
        if (!tool) return;

        const start = normalizePoint(data.start);
        const end = normalizePoint(data.end);
        if (!start || !end) return;

        const stroke = {
            strokeId: `${socket.id}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            authorId: socket.id,
            authorName: getPictoName(socket.id, onlinePlayers),
            tool,
            color: sanitizeColor(data.color),
            size: sanitizeSize(data.size),
            start,
            end
        };

        pictoState.strokes.push(stroke);
        trimStrokes();

        const redo = getRedoStack(socket.id);
        redo.length = 0;

        io.to(PICTO_ROOM).emit('picto-shape', stroke);

        await saveStroke(stroke);
    } catch (err) { console.error('picto-shape error:', err.message); } });

    // --- Pictochat Undo ---
    socket.on('picto-undo', async (data) => { try {
        if (!checkRateLimit(socket, 5)) return;
        if (!data || typeof data !== 'object') return;

        const strokeId = typeof data.strokeId === 'string' ? data.strokeId : '';
        const strokes = pictoState.strokes;
        const index = strokes.findIndex(s => s.strokeId === strokeId && s.authorId === socket.id);
        if (index === -1) return;

        const [removed] = strokes.splice(index, 1);
        getRedoStack(socket.id).push(removed);

        io.to(PICTO_ROOM).emit('picto-undo', {
            strokeId,
            byId: socket.id
        });

        await deleteStroke(strokeId);
    } catch (err) { console.error('picto-undo error:', err.message); } });

    // --- Pictochat Redo ---
    socket.on('picto-redo', async () => { try {
        if (!checkRateLimit(socket, 5)) return;

        const redo = getRedoStack(socket.id);
        if (!redo.length) return;

        const stroke = redo.pop();
        pictoState.strokes.push(stroke);
        trimStrokes();

        io.to(PICTO_ROOM).emit('picto-redo', {
            stroke,
            byId: socket.id
        });

        await saveStroke(stroke);
    } catch (err) { console.error('picto-redo error:', err.message); } });

    // --- Pictochat Clear ---
    socket.on('picto-clear', async () => { try {
        if (!checkRateLimit(socket, 2)) return;

        pictoState.strokes = [];
        getRedoStack(socket.id).length = 0;
        pictoState.inProgress.clear();

        io.to(PICTO_ROOM).emit('picto-clear', {
            byId: socket.id
        });

        await clearStrokes();
    } catch (err) { console.error('picto-clear error:', err.message); } });

    // --- Pictochat Message ---
    socket.on('picto-message', async (text) => { try {
        if (!checkRateLimit(socket, 6)) return;
        if (typeof text !== 'string') return;
        const message = text.replace(/[<>&"'`]/g, '').slice(0, 200).trim();
        if (!message) return;

        const payload = {
            name: getPictoName(socket.id, onlinePlayers),
            text: message,
            timestamp: Date.now()
        };

        pictoState.messages.push(payload);
        // Keep in-memory message list bounded
        if (pictoState.messages.length > PICTO_MAX_MESSAGES) {
            pictoState.messages.splice(0, pictoState.messages.length - PICTO_MAX_MESSAGES);
        }

        io.to(PICTO_ROOM).emit('picto-message', payload);

        await saveMessage(payload.name, payload.text);
    } catch (err) { console.error('picto-message error:', err.message); } });
}

export function cleanupPictochatOnDisconnect(socketId, io) {
    cleanupPictoForSocket(socketId, io);
    io.to(PICTO_ROOM).emit('picto-cursor-hide', { id: socketId });
}
