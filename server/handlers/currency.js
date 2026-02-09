import { sanitizeName, validateCharacter, validateGameType, emitBalanceUpdate } from '../socket-utils.js';
import { getBalance, addBalance, deductBalance, getDiamonds, buyDiamonds } from '../currency.js';
import { broadcastOnlinePlayers } from '../room-manager.js';
import { saveCharacter, getCharacter } from '../character-store.js';

export function registerCurrencyHandlers(socket, io, { checkRateLimit, onlinePlayers }) {
    socket.on('register-player', async (data) => { try {
        if (!checkRateLimit(socket)) return;
        if (!data || typeof data !== 'object') return;

        const name = sanitizeName(data.name);
        if (!name) return;
        const character = validateCharacter(data.character);
        const game = validateGameType(data.game);

        onlinePlayers.set(socket.id, { name, character, game });
        broadcastOnlinePlayers(io);

        // Persist character portrait to database
        if (character) await saveCharacter(name, character);

        // Send currency balance to the player
        socket.emit('balance-update', { balance: await getBalance(name) });

        console.log(`Registered: ${name} for ${game}`);
    } catch (err) { console.error('register-player error:', err.message); } });

    // --- Get Player Diamonds (for contacts list) ---
    // NOTE: This handler and the one below share the same event name but have different signatures.
    // This is pre-existing design: contacts.js passes {name}, shop.js passes nothing.
    // Both handlers will fire; the first validates data.name, the second uses socket's player.
    socket.on('get-player-diamonds', async (data) => { try {
        if (!checkRateLimit(socket)) return;
        if (!data || typeof data !== 'object') return;
        const name = sanitizeName(data.name);
        if (!name) return;

        const diamonds = await getDiamonds(name);
        socket.emit('player-diamonds', { name, diamonds });
    } catch (err) { console.error('get-player-diamonds error:', err.message); } });

    // --- Get Player Character (for contacts app) ---
    socket.on('get-player-character', async (data) => { try {
        if (!checkRateLimit(socket)) return;
        if (!data || typeof data !== 'object') return;
        const name = sanitizeName(data.name);
        if (!name) return;

        // Find the player by name in onlinePlayers
        let found = null;
        for (const [, p] of onlinePlayers) {
            if (p.name === name) {
                found = p;
                break;
            }
        }

        const character = found?.character || await getCharacter(name);
        const game = found?.game || null;
        const diamondCount = await getDiamonds(name);
        socket.emit('player-character', {
            name,
            character,
            game,
            diamonds: diamondCount
        });
    } catch (err) { console.error('get-player-character error:', err.message); } });

    // --- Get Currency Balance ---
    socket.on('get-balance', async () => { try {
        if (!checkRateLimit(socket)) return;
        const player = onlinePlayers.get(socket.id);
        if (!player) return;
        socket.emit('balance-update', { balance: await getBalance(player.name) });
    } catch (err) { console.error('get-balance error:', err.message); } });

    // --- Get Player Diamonds ---
    socket.on('get-player-diamonds', async () => { try {
        if (!checkRateLimit(socket)) return;
        const player = onlinePlayers.get(socket.id);
        if (!player || !player.name) return;
        const diamonds = await getDiamonds(player.name);
        socket.emit('diamonds-update', { diamonds });
    } catch (err) { console.error('get-player-diamonds error:', err.message); } });

    // --- Buy Diamonds ---
    socket.on('buy-diamonds', async (data) => { try {
        if (!checkRateLimit(socket)) return;
        const player = onlinePlayers.get(socket.id);
        if (!player || !player.name) return;
        
        const count = Number(data?.count) || 1;
        if (!Number.isInteger(count) || count <= 0 || count > 100) {
            socket.emit('error', { message: 'Ungültige Anzahl' });
            return;
        }
        
        const result = await buyDiamonds(player.name, count);
        if (result === null) {
            socket.emit('error', { message: 'Nicht genug Coins!' });
            return;
        }
        
        socket.emit('balance-update', { balance: result.balance });
        socket.emit('diamonds-update', { diamonds: result.diamonds });
    } catch (err) { console.error('buy-diamonds error:', err.message); } });

    // --- Make It Rain Effect ---
    socket.on('lobby-make-it-rain', async () => { try {
        if (!checkRateLimit(socket)) return;
        const player = onlinePlayers.get(socket.id);
        if (!player || !player.name) return;
        
        const cost = 20;
        const newBalance = await deductBalance(player.name, cost, 'lobby_effect_rain');
        if (newBalance === null) {
            socket.emit('error', { message: 'Nicht genug Coins!' });
            return;
        }
        
        socket.emit('balance-update', { balance: newBalance });
        
        // Broadcast to all connected users (celebration effect visible to everyone)
        // Note: No lobby room exists; this is intentional so all users see the effect
        io.emit('lobby-rain-effect', { playerName: player.name });
    } catch (err) { console.error('lobby-make-it-rain error:', err.message); } });
}
