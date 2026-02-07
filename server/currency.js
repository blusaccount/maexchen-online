// ============== CURRENCY MANAGEMENT ==============

const STARTING_BALANCE = 100;

// Currency balances keyed by player name (persists across reconnections)
const balances = new Map(); // playerName -> number

export function getBalance(playerName) {
    if (!balances.has(playerName)) {
        balances.set(playerName, STARTING_BALANCE);
    }
    return balances.get(playerName);
}

export function addBalance(playerName, amount) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return null;
    const current = getBalance(playerName);
    const newBalance = current + amount;
    balances.set(playerName, newBalance);
    return newBalance;
}

export function deductBalance(playerName, amount) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return null;
    const current = getBalance(playerName);
    if (amount > current) return null; // Insufficient funds
    const newBalance = current - amount;
    balances.set(playerName, newBalance);
    return newBalance;
}

export { STARTING_BALANCE };
