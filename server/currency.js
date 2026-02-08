// ============== CURRENCY MANAGEMENT ==============

import { isDatabaseEnabled, query, withTransaction } from './db.js';

const STARTING_BALANCE = 1000;

// Fallback in-memory storage for local development without DATABASE_URL
const balances = new Map(); // playerName -> number
const diamonds = new Map(); // playerName -> number

function isValidAmount(amount) {
    return typeof amount === 'number' && Number.isFinite(amount) && amount > 0;
}

function normalizeMoney(amount) {
    return Math.round(amount * 100) / 100;
}

async function getBalanceMemory(playerName) {
    if (!balances.has(playerName)) {
        balances.set(playerName, STARTING_BALANCE);
    }
    return balances.get(playerName);
}

async function getOrCreatePlayerBalance(playerName, client = null) {
    const runner = client || { query };

    await runner.query(
        `insert into players (name, balance)
         values ($1, $2)
         on conflict (name) do nothing`,
        [playerName, STARTING_BALANCE]
    );

    const result = await runner.query(
        'select balance from players where name = $1 limit 1',
        [playerName]
    );

    if (!result.rows[0]) return STARTING_BALANCE;
    return Number(result.rows[0].balance);
}

export async function getBalance(playerName, client = null) {
    if (!isDatabaseEnabled()) {
        return getBalanceMemory(playerName);
    }
    return getOrCreatePlayerBalance(playerName, client);
}

export async function addBalance(playerName, amount, reason = 'adjustment', metadata = null, client = null) {
    if (!isValidAmount(amount)) return null;
    amount = normalizeMoney(amount);

    if (!isDatabaseEnabled()) {
        const current = await getBalanceMemory(playerName);
        const newBalance = normalizeMoney(current + amount);
        balances.set(playerName, newBalance);
        return newBalance;
    }

    // When no external client is provided, wrap in a transaction so
    // balance update + ledger insert are atomic.
    if (!client) {
        return withTransaction(async (txClient) => {
            return _addBalanceDB(playerName, amount, reason, metadata, txClient);
        });
    }
    return _addBalanceDB(playerName, amount, reason, metadata, client);
}

async function _addBalanceDB(playerName, amount, reason, metadata, client) {
    await getOrCreatePlayerBalance(playerName, client);

    const updated = await client.query(
        'update players set balance = round((balance + $1)::numeric, 2), updated_at = now() where name = $2 returning id, balance',
        [amount, playerName]
    );

    const row = updated.rows[0];
    if (!row) return null;

    await client.query(
        `insert into wallet_ledger (player_id, delta, reason, metadata)
         values ($1, $2, $3, $4)`,
        [row.id, amount, reason, metadata]
    );

    return Number(row.balance);
}

export async function deductBalance(playerName, amount, reason = 'adjustment', metadata = null, client = null) {
    if (!isValidAmount(amount)) return null;
    amount = normalizeMoney(amount);

    if (!isDatabaseEnabled()) {
        const current = await getBalanceMemory(playerName);
        if (amount > current) return null;
        const newBalance = normalizeMoney(current - amount);
        balances.set(playerName, newBalance);
        return newBalance;
    }

    // When no external client is provided, wrap in a transaction so
    // balance update + ledger insert are atomic.
    if (!client) {
        return withTransaction(async (txClient) => {
            return _deductBalanceDB(playerName, amount, reason, metadata, txClient);
        });
    }
    return _deductBalanceDB(playerName, amount, reason, metadata, client);
}

async function _deductBalanceDB(playerName, amount, reason, metadata, client) {
    await getOrCreatePlayerBalance(playerName, client);

    const updated = await client.query(
        `update players
         set balance = round((balance - $1)::numeric, 2), updated_at = now()
         where name = $2 and balance >= $1
         returning id, balance`,
        [amount, playerName]
    );

    const row = updated.rows[0];
    if (!row) return null;

    await client.query(
        `insert into wallet_ledger (player_id, delta, reason, metadata)
         values ($1, $2, $3, $4)`,
        [row.id, -amount, reason, metadata]
    );

    return Number(row.balance);
}

export function getAllPlayerNamesMemory() {
    return Array.from(balances.keys());
}

// ============== DIAMOND MANAGEMENT ==============

async function getDiamondsMemory(playerName) {
    return diamonds.get(playerName) || 0;
}

export async function getDiamonds(playerName) {
    if (!isDatabaseEnabled()) {
        return getDiamondsMemory(playerName);
    }

    await getOrCreatePlayerBalance(playerName);
    const result = await query(
        'select diamonds from players where name = $1',
        [playerName]
    );
    return result.rows[0]?.diamonds || 0;
}

export async function buyDiamonds(playerName, count = 1) {
    if (!Number.isInteger(count) || count <= 0) return null;
    
    const cost = 25 * count;

    if (!isDatabaseEnabled()) {
        const currentBalance = await getBalanceMemory(playerName);
        if (cost > currentBalance) return null;
        
        const newBalance = normalizeMoney(currentBalance - cost);
        balances.set(playerName, newBalance);
        
        const currentDiamonds = diamonds.get(playerName) || 0;
        const newDiamonds = currentDiamonds + count;
        diamonds.set(playerName, newDiamonds);
        
        return {
            balance: newBalance,
            diamonds: newDiamonds
        };
    }

    return withTransaction(async (txClient) => {
        // Deduct coins
        const newBalance = await _deductBalanceDB(playerName, cost, 'diamond_purchase', { count }, txClient);
        if (newBalance === null) return null;
        
        // Add diamonds
        const result = await txClient.query(
            'update players set diamonds = diamonds + $1 where name = $2 returning diamonds',
            [count, playerName]
        );
        
        return {
            balance: newBalance,
            diamonds: result.rows[0]?.diamonds || 0
        };
    });
}

export { STARTING_BALANCE };
