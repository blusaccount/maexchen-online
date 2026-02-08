// ============== PORTFOLIO HISTORY ==============
// Tracks periodic snapshots of each player's portfolio value for charting.
// In-memory only — history resets on server restart.

const MAX_SNAPSHOTS = 100; // per player

// playerName -> Array<{ ts: number, portfolioValue: number, cash: number, netWorth: number }>
const history = new Map();

/**
 * Record a portfolio snapshot for a player.
 */
export function recordSnapshot(playerName, portfolioValue, cash) {
    if (typeof playerName !== 'string' || !playerName) return;
    if (typeof portfolioValue !== 'number' || !Number.isFinite(portfolioValue)) return;
    if (typeof cash !== 'number' || !Number.isFinite(cash)) return;

    if (!history.has(playerName)) {
        history.set(playerName, []);
    }
    const snapshots = history.get(playerName);
    const netWorth = portfolioValue + cash;
    snapshots.push({
        ts: Date.now(),
        portfolioValue: parseFloat(portfolioValue.toFixed(2)),
        cash: parseFloat(cash.toFixed(2)),
        netWorth: parseFloat(netWorth.toFixed(2)),
    });
    if (snapshots.length > MAX_SNAPSHOTS) {
        snapshots.splice(0, snapshots.length - MAX_SNAPSHOTS);
    }
}

/**
 * Get all snapshots for a player.
 * @returns {Array<{ ts: number, portfolioValue: number, cash: number, netWorth: number }>}
 */
export function getHistory(playerName) {
    return history.get(playerName) || [];
}
