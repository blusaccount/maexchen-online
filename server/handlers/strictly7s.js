import { randomInt } from 'crypto';
import { addBalance, deductBalance } from '../currency.js';

const STRICTLY7S_BETS = [2, 5, 10, 15, 20, 50];
const STRICTLY7S_SYMBOLS = [
    { id: 'SEVEN', label: '7', weight: 1, multiplier: 84 },
    { id: 'BAR', label: 'BAR', weight: 2, multiplier: 34 },
    { id: 'DIAMOND', label: 'DIAMOND', weight: 3, multiplier: 25 },
    { id: 'BELL', label: 'BELL', weight: 4, multiplier: 17 },
    { id: 'CHERRY', label: 'CHERRY', weight: 6, multiplier: 13 },
    { id: 'LEMON', label: 'LEMON', weight: 8, multiplier: 8 }
];
const STRICTLY7S_TOTAL_WEIGHT = STRICTLY7S_SYMBOLS.reduce((sum, s) => sum + s.weight, 0);

function pickStrictly7sSymbol() {
    const roll = randomInt(1, STRICTLY7S_TOTAL_WEIGHT + 1);
    let acc = 0;
    for (const symbol of STRICTLY7S_SYMBOLS) {
        acc += symbol.weight;
        if (roll <= acc) return symbol;
    }
    return STRICTLY7S_SYMBOLS[STRICTLY7S_SYMBOLS.length - 1];
}

function evaluateStrictly7sSpin(reels) {
    if (!Array.isArray(reels) || reels.length !== 3) {
        return { multiplier: 0, winType: 'none', symbol: null };
    }

    const [a, b, c] = reels;
    if (a.id === b.id && b.id === c.id) {
        return { multiplier: a.multiplier, winType: 'three-kind', symbol: a.id };
    }

    const cherryCount = reels.filter(r => r.id === 'CHERRY').length;
    if (cherryCount >= 2) {
        return { multiplier: 2, winType: 'two-cherries', symbol: 'CHERRY' };
    }

    return { multiplier: 0, winType: 'none', symbol: null };
}

export function registerStrictly7sHandlers(socket, io, deps) {
    const { checkRateLimit, checkStrictly7sCooldown, onlinePlayers } = deps;

    socket.on('strictly7s-spin', async (data) => { try {
        if (!checkRateLimit(socket, 5)) return;
        if (!checkStrictly7sCooldown(socket.id)) {
            socket.emit('strictly7s-error', { message: 'Spin cooldown active. Try again.' });
            return;
        }

        const player = onlinePlayers.get(socket.id);
        if (!player || !player.name) {
            socket.emit('strictly7s-error', { message: 'Not logged in' });
            return;
        }

        const bet = Number(data?.bet);
        if (!Number.isInteger(bet) || !STRICTLY7S_BETS.includes(bet)) {
            socket.emit('strictly7s-error', { message: 'Invalid bet amount' });
            return;
        }

        const balanceAfterBet = await deductBalance(player.name, bet, 'strictly7s_bet', { bet });
        if (balanceAfterBet === null) {
            socket.emit('strictly7s-error', { message: 'Not enough coins' });
            return;
        }

        const reels = [pickStrictly7sSymbol(), pickStrictly7sSymbol(), pickStrictly7sSymbol()];
        const outcome = evaluateStrictly7sSpin(reels);

        let payout = 0;
        let finalBalance = balanceAfterBet;
        if (outcome.multiplier > 0) {
            payout = bet * outcome.multiplier;
            const updated = await addBalance(player.name, payout, 'strictly7s_payout', {
                bet,
                payout,
                winType: outcome.winType,
                reels: reels.map(r => r.id)
            });
            if (updated !== null) {
                finalBalance = updated;
            }
        }

        socket.emit('balance-update', { balance: finalBalance });
        socket.emit('strictly7s-spin-result', {
            reels: reels.map(r => r.id),
            bet,
            payout,
            multiplier: outcome.multiplier,
            winType: outcome.winType,
            balance: finalBalance
        });
    } catch (err) {
        console.error('strictly7s-spin error:', err.message);
        socket.emit('strictly7s-error', { message: 'Spin failed. Try again.' });
    } });
}
