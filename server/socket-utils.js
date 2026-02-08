export function sanitizeName(name) {
    if (typeof name !== 'string') return '';
    const clean = name.replace(/[<>&"'/]/g, '').trim().slice(0, 20);
    if (clean.length < 2) return '';
    return clean;
}

export function validateCharacter(character) {
    if (!character || typeof character !== 'object') return null;
    // Limit character data size (~4KB JSON max, supports full 16x16 pixel grid + dataURL)
    const json = JSON.stringify(character);
    if (json.length > 4096) return null;
    // Only allow expected keys
    const allowed = { pixels: true, dataURL: true };
    const clean = {};
    for (const key of Object.keys(character)) {
        if (allowed[key]) clean[key] = character[key];
    }
    // Validate dataURL if present
    if (clean.dataURL && (typeof clean.dataURL !== 'string' || !clean.dataURL.startsWith('data:image/'))) {
        delete clean.dataURL;
    }
    return clean;
}

export function validateRoomCode(code) {
    if (typeof code !== 'string') return '';
    return code.replace(/[^A-Z0-9]/g, '').slice(0, 4);
}

export function validateGameType(gameType) {
    if (typeof gameType !== 'string') return 'maexchen';
    const allowed = ['maexchen', 'lobby', 'watchparty', 'stocks', 'strictbrain', 'lol-betting', 'loop-machine'];
    const clean = gameType.replace(/[^a-z-]/g, '').slice(0, 20);
    return allowed.includes(clean) ? clean : 'maexchen';
}

export function validateYouTubeId(videoId) {
    if (typeof videoId !== 'string') return '';
    return videoId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 11);
}

export function normalizePoint(point) {
    if (!point || typeof point !== 'object') return null;
    const x = Number(point.x);
    const y = Number(point.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
}

export function sanitizeColor(color) {
    if (typeof color !== 'string') return '#000000';
    return /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#000000';
}

export function sanitizeSize(size) {
    const n = Number(size);
    if (!Number.isFinite(n)) return 4;
    return Math.max(1, Math.min(18, Math.round(n)));
}

export function emitStockError(socket, code, message) {
    socket.emit('stock-error', {
        code,
        message,
        // Backward compatibility for clients reading `error`
        error: message
    });
}

export function emitBalanceUpdate(io, socketId, balance) {
    if (balance === null || balance === undefined) return;
    io.to(socketId).emit('balance-update', { balance });
}

export function getSocketIp(socket) {
    const forwarded = socket?.handshake?.headers?.['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0].trim();
    }
    return socket?.handshake?.address || socket?.request?.socket?.remoteAddress || socket?.conn?.remoteAddress || 'unknown';
}
