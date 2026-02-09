import {
    rooms, onlinePlayers, socketToRoom,
    broadcastOnlinePlayers, broadcastLobbies,
    getRoom, removePlayerFromRoom
} from './room-manager.js';
import { getSocketIp } from './socket-utils.js';

import { registerCurrencyHandlers } from './handlers/currency.js';
import { registerLobbyHandlers } from './handlers/lobby.js';
import { registerMaexchenHandlers } from './handlers/maexchen.js';
import { registerBrainVersusHandlers, cleanupBrainVersusOnDisconnect } from './handlers/brain-versus.js';
import { registerStocksHandlers, cleanupStockQuoteCache } from './handlers/stocks.js';
import { registerLolBettingHandlers } from './handlers/lol-betting.js';
import { registerPictochatHandlers, cleanupPictochatOnDisconnect } from './handlers/pictochat.js';
import { registerSoundboardHandlers } from './handlers/soundboard.js';
import { registerStrictClubHandlers, cleanupClubOnDisconnect } from './handlers/strict-club.js';
import { registerLoopMachineHandlers, cleanupLoopOnDisconnect } from './handlers/loop-machine.js';
import { registerStrictly7sHandlers } from './handlers/strictly7s.js';
import { registerWatchpartyHandlers } from './handlers/watchparty.js';

// ============== RATE LIMITING ==============

const rateLimiters = new Map(); // socketId -> { count, resetTime }
const rateLimitersIp = new Map(); // ip -> { count, resetTime }
const stockTradeCooldown = new Map(); // socketId -> timestamp
const strictly7sSpinCooldown = new Map(); // socketId -> timestamp

function checkRateLimit(socketOrId, maxPerSecond = 10) {
    const now = Date.now();
    const socketId = typeof socketOrId === 'string' ? socketOrId : socketOrId?.id;
    if (!socketId) return false;

    let entry = rateLimiters.get(socketId);
    if (!entry || now > entry.resetTime) {
        entry = { count: 0, resetTime: now + 1000 };
        rateLimiters.set(socketId, entry);
    }
    entry.count++;
    if (entry.count > maxPerSecond) return false;

    if (typeof socketOrId !== 'string') {
        const ip = getSocketIp(socketOrId);
        let ipEntry = rateLimitersIp.get(ip);
        if (!ipEntry || now > ipEntry.resetTime) {
            ipEntry = { count: 0, resetTime: now + 1000 };
            rateLimitersIp.set(ip, ipEntry);
        }
        ipEntry.count++;
        if (ipEntry.count > maxPerSecond) return false;
    }

    return true;
}

function checkStockTradeCooldown(socketId, minIntervalMs = 400) {
    const now = Date.now();
    const lastTradeAt = stockTradeCooldown.get(socketId) || 0;
    if (now - lastTradeAt < minIntervalMs) return false;
    stockTradeCooldown.set(socketId, now);
    return true;
}

function checkStrictly7sCooldown(socketId, minIntervalMs = 1200) {
    const now = Date.now();
    const lastSpinAt = strictly7sSpinCooldown.get(socketId) || 0;
    if (now - lastSpinAt < minIntervalMs) return false;
    strictly7sSpinCooldown.set(socketId, now);
    return true;
}

export function cleanupRateLimiters() {
    const now = Date.now();
    for (const [id, entry] of rateLimiters) {
        if (now > entry.resetTime) rateLimiters.delete(id);
    }
    for (const [ip, entry] of rateLimitersIp) {
        if (now > entry.resetTime) rateLimitersIp.delete(ip);
    }
    cleanupStockQuoteCache();
}

export function registerSocketHandlers(io, { fetchTickerQuotes, getYahooFinance, isStockGameEnabled = true } = {}) {
    const deps = {
        checkRateLimit,
        checkStockTradeCooldown,
        checkStrictly7sCooldown,
        rooms,
        onlinePlayers,
        socketToRoom,
        broadcastOnlinePlayers,
        broadcastLobbies,
        getRoom,
        removePlayerFromRoom,
        fetchTickerQuotes,
        getYahooFinance,
        isStockGameEnabled
    };

    io.on('connection', (socket) => {
        registerCurrencyHandlers(socket, io, deps);
        registerLobbyHandlers(socket, io, deps);
        registerMaexchenHandlers(socket, io, deps);
        registerBrainVersusHandlers(socket, io, deps);
        registerStocksHandlers(socket, io, deps);
        registerLolBettingHandlers(socket, io, deps);
        registerPictochatHandlers(socket, io, deps);
        registerSoundboardHandlers(socket, io, deps);
        registerStrictClubHandlers(socket, io, deps);
        registerLoopMachineHandlers(socket, io, deps);
        registerStrictly7sHandlers(socket, io, deps);
        registerWatchpartyHandlers(socket, io, deps);

        socket.on('disconnect', async () => { try {
            rateLimiters.delete(socket.id);
            stockTradeCooldown.delete(socket.id);
            strictly7sSpinCooldown.delete(socket.id);

            cleanupPictochatOnDisconnect(socket.id, io);
            cleanupClubOnDisconnect(socket.id, io);
            cleanupLoopOnDisconnect(socket.id, io);

            onlinePlayers.delete(socket.id);
            broadcastOnlinePlayers(io);

            const room = getRoom(socket.id);
            if (room) {
                await cleanupBrainVersusOnDisconnect(socket, room, io);
                await removePlayerFromRoom(io, socket.id, room);
                if (room.gameType === 'strictbrain') {
                    broadcastLobbies(io, 'strictbrain');
                }
            }
        } catch (err) { console.error('disconnect error:', err.message); } });
    });
}
