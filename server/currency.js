// ============== CURRENCY MANAGEMENT ==============

import { isDatabaseEnabled, query } from './db.js';

const STARTING_BALANCE = 1000;

// Fallback in-memory storage for local development without DATABASE_URL
const balances = new Map(); // playerName -> number

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

export async function getBalancesBatch(names) {
    if (!isDatabaseEnabled()) {
        return names.reduce((acc, name) => {
            acc[name] = balances.get(name) || STARTING_BALANCE;
            return acc;
        }, {});
    }
    
    const result = await query(
        'SELECT player_name, balance FROM players WHERE player_name = ANY($1)',
        [names]
    );
    
    const balanceMap = {};
    for (const row of result.rows) {
        balanceMap[row.player_name] = Number(row.balance);
    }
    
    // Fill in missing players with starting balance
    for (const name of names) {
        if (!(name in balanceMap)) {
            balanceMap[name] = STARTING_BALANCE;
        }
    }
    
    return balanceMap;
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

    const runner = client || { query };
    await getOrCreatePlayerBalance(playerName, runner);

    const updated = await runner.query(
        'update players set balance = round((balance + $1)::numeric, 2), updated_at = now() where name = $2 returning id, balance',
        [amount, playerName]
    );

    const row = updated.rows[0];
    if (!row) return null;

    await runner.query(
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

    const runner = client || { query };
    await getOrCreatePlayerBalance(playerName, runner);

    const updated = await runner.query(
        `update players
         set balance = round((balance - $1)::numeric, 2), updated_at = now()
         where name = $2 and balance >= $1
         returning id, balance`,
        [amount, playerName]
    );

    const row = updated.rows[0];
    if (!row) return null;

    await runner.query(
        `insert into wallet_ledger (player_id, delta, reason, metadata)
         values ($1, $2, $3, $4)`,
        [row.id, -amount, reason, metadata]
    );

    return Number(row.balance);
}

export function getAllPlayerNamesMemory() {
    return Array.from(balances.keys());
}

export { STARTING_BALANCE };
