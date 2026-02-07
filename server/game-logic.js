// ============== GAME CONSTANTS ==============

// Dice value encoding: higher die as tens digit (e.g., roll 3+1 = 31)
// ROLL_ORDER: normals (31-65) < pasches (11-66) < Mäxchen (21)
export const ROLL_ORDER = [
    31, 32, 41, 42, 43, 51, 52, 53, 54, 61, 62, 63, 64, 65, // Normale
    11, 22, 33, 44, 55, 66, // Pasches
    21 // Mäxchen
];

export const STARTING_LIVES = 3;

// ============== HELPER FUNCTIONS ==============

export function rollRank(val) {
    return ROLL_ORDER.indexOf(val);
}

export function rollName(val) {
    if (val === 21) return 'Mäxchen!';
    const d1 = Math.floor(val / 10);
    const d2 = val % 10;
    if (d1 === d2) return `Pasch ${d1}er`;
    return String(val);
}

export function rollDice() {
    const a = Math.floor(Math.random() * 6) + 1;
    const b = Math.floor(Math.random() * 6) + 1;
    const high = Math.max(a, b);
    const low = Math.min(a, b);
    return { d1: high, d2: low, value: high * 10 + low };
}

export function isMaexchen(val) {
    return val === 21;
}

// ============== GAME LOGIC ==============

export function getAlivePlayers(game) {
    return game.players.filter(p => p.lives > 0);
}

export function nextAlivePlayerIndex(game, fromIndex) {
    let idx = fromIndex;
    let safety = 0;
    do {
        idx = (idx + 1) % game.players.length;
        safety++;
    } while (game.players[idx].lives <= 0 && safety < game.players.length);
    return idx;
}
