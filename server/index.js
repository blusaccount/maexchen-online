import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

import { rooms, onlinePlayers, broadcastOnlinePlayers, broadcastLobbies } from './room-manager.js';
import { registerSocketHandlers, cleanupRateLimiters } from './socket-handlers.js';
import { startDiscordBot } from './discord-bot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Password protection
const PASSWORD = process.env.SITE_PASSWORD || 'STRICT';

// Session secret validation
if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
    console.error('ERROR: SESSION_SECRET environment variable is required in production');
    process.exit(1);
}

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'strict-hotel-dev-secret-' + Math.random(),
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    }
}));

// Body parser for login
app.use(express.json());

// Login route (must be before auth middleware)
app.post('/login', (req, res) => {
    const { password } = req.body;
    if (password === PASSWORD) {
        req.session.authenticated = true;
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: 'Incorrect password' });
    }
});

// Auth middleware - protect all routes except login
app.use((req, res, next) => {
    // Allow access to login page, health check, and static assets needed for login
    if (req.path === '/login.html' || 
        req.path === '/health' ||
        req.path.startsWith('/shared/css/') ||
        req.path.startsWith('/shared/fonts/')) {
        return next();
    }

    // Check if user is authenticated
    if (req.session.authenticated) {
        return next();
    }

    // Redirect to login page
    res.redirect('/login.html');
});

// Static files
app.use(express.static(path.join(rootDir, 'public')));
app.use('/shared', express.static(path.join(rootDir, 'shared')));
app.use('/games', express.static(path.join(rootDir, 'games')));

// ============== HEALTH CHECK ==============

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        players: onlinePlayers.size,
        rooms: rooms.size
    });
});

// ============== SOCKET HANDLERS ==============

registerSocketHandlers(io);

// ============== PERIODIC CLEANUP ==============

// Every 5 minutes: remove orphaned entries where socket is no longer connected
setInterval(() => {
    const connectedIds = new Set();
    for (const [id] of io.sockets.sockets) {
        connectedIds.add(id);
    }

    // Cleanup onlinePlayers
    let removedPlayers = 0;
    for (const [socketId] of onlinePlayers) {
        if (!connectedIds.has(socketId)) {
            onlinePlayers.delete(socketId);
            removedPlayers++;
        }
    }

    // Cleanup rooms with disconnected players
    let removedRooms = 0;
    for (const [code, room] of rooms) {
        room.players = room.players.filter(p => connectedIds.has(p.socketId));
        if (room.players.length === 0) {
            rooms.delete(code);
            removedRooms++;
        } else if (!connectedIds.has(room.hostId)) {
            room.hostId = room.players[0].socketId;
        }
    }

    // Cleanup rate limiters
    cleanupRateLimiters();

    if (removedPlayers > 0 || removedRooms > 0) {
        console.log(`[Cleanup] Removed ${removedPlayers} orphaned players, ${removedRooms} empty rooms`);
        if (removedPlayers > 0) broadcastOnlinePlayers(io);
    }
}, 5 * 60 * 1000);

// ============== START SERVER ==============

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
    console.log(`✓ StrictHotel Server: http://localhost:${PORT}`);

    // Discord Bot starten
    try {
        await startDiscordBot(rootDir);
    } catch (err) {
        console.error('Discord Bot Fehler:', err.message);
    }
});
