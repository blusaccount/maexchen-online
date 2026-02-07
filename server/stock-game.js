// ============== STOCK GAME ==============
// Players invest StrictCoins into real stocks (1 StrictCoin = 1 USD).
// Portfolio value tracks the real market price so gains/losses mirror reality.

import { getBalance, addBalance, deductBalance } from './currency.js';
import { isDatabaseEnabled, query, withTransaction } from './db.js';

// Small tolerance for floating-point comparison when selling shares
const FP_TOLERANCE = 1.0001;

// Fallback in-memory storage for local development without DATABASE_URL
const portfolios = new Map(); // playerName -> Map<symbol, { shares: number, avgCost: number }>

function round2(n) {
    return Math.round(n * 100) / 100;
}

function getPortfolioMemory(playerName) {
    if (!portfolios.has(playerName)) {
        portfolios.set(playerName, new Map());
    }
    return portfolios.get(playerName);
}

async function getOrCreatePlayerId(playerName, client = null) {
    const runner = client || { query };
    const currentBalance = await getBalance(playerName, runner);

    const result = await runner.query(
        `insert into players (name, balance)
         values ($1, $2)
         on conflict (name) do update set updated_at = now()
         returning id`,
        [playerName, currentBalance]
    );

    return result.rows[0]?.id || null;
}

/**
 * Buy shares of a stock.
 * @returns {Promise<{ ok:boolean, error?:string, shares?:number, newBalance?:number }>}
 */
export async function buyStock(playerName, symbol, price, amount) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        return { ok: false, error: 'Invalid amount' };
    }
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
        return { ok: false, error: 'Invalid price' };
    }

    amount = round2(amount);

    if (!isDatabaseEnabled()) {
        const newBalance = await deductBalance(playerName, amount, 'stock_buy', { symbol, price, amount });
        if (newBalance === null) {
            return { ok: false, error: 'Insufficient funds' };
        }

        const shares = amount / price;
        const portfolio = getPortfolioMemory(playerName);
        const existing = portfolio.get(symbol);

        if (existing) {
            const totalCost = existing.avgCost * existing.shares + amount;
            existing.shares += shares;
            existing.avgCost = totalCost / existing.shares;
        } else {
            portfolio.set(symbol, { shares, avgCost: price });
        }

        return { ok: true, shares, newBalance };
    }

    try {
        const txResult = await withTransaction(async (client) => {
            const newBalance = await deductBalance(playerName, amount, 'stock_buy', { symbol, price, amount }, client);
            if (newBalance === null) {
                return { ok: false, error: 'Insufficient funds' };
            }

            const playerId = await getOrCreatePlayerId(playerName, client);
            const shares = amount / price;

            const current = await client.query(
                'select shares, avg_cost from stock_positions where player_id = $1 and symbol = $2',
                [playerId, symbol]
            );

            if (current.rows[0]) {
                const existingShares = Number(current.rows[0].shares);
                const existingAvgCost = Number(current.rows[0].avg_cost);
                const totalCost = existingAvgCost * existingShares + amount;
                const newShares = existingShares + shares;
                const newAvgCost = totalCost / newShares;

                await client.query(
                    `update stock_positions
                     set shares = $1, avg_cost = $2
                     where player_id = $3 and symbol = $4`,
                    [newShares, newAvgCost, playerId, symbol]
                );
            } else {
                await client.query(
                    `insert into stock_positions (player_id, symbol, shares, avg_cost)
                     values ($1, $2, $3, $4)`,
                    [playerId, symbol, shares, price]
                );
            }

            return { ok: true, shares, newBalance };
        });

        return txResult;
    } catch (err) {
        console.error('buyStock DB error:', err.message);
        return { ok: false, error: 'Transaction failed' };
    }
}

/**
 * Sell shares of a stock.
 * @returns {Promise<{ ok:boolean, error?:string, shares?:number, newBalance?:number }>}
 */
export async function sellStock(playerName, symbol, price, amount) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        return { ok: false, error: 'Invalid amount' };
    }
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
        return { ok: false, error: 'Invalid price' };
    }

    amount = round2(amount);

    if (!isDatabaseEnabled()) {
        const portfolio = getPortfolioMemory(playerName);
        const holding = portfolio.get(symbol);

        if (!holding || holding.shares <= 0) {
            return { ok: false, error: 'No shares to sell' };
        }

        const sharesToSell = amount / price;
        if (sharesToSell > holding.shares * FP_TOLERANCE) {
            return { ok: false, error: 'Not enough shares' };
        }

        const actualShares = Math.min(sharesToSell, holding.shares);
        const proceeds = actualShares * price;

        holding.shares -= actualShares;
        if (holding.shares < 1e-10) portfolio.delete(symbol);

        const newBalance = await addBalance(playerName, round2(proceeds), 'stock_sell', { symbol, price, amount: round2(proceeds) });
        return { ok: true, shares: actualShares, newBalance };
    }

    try {
        const txResult = await withTransaction(async (client) => {
            const playerId = await getOrCreatePlayerId(playerName, client);
            const current = await client.query(
                'select shares from stock_positions where player_id = $1 and symbol = $2',
                [playerId, symbol]
            );
            const holding = current.rows[0];
            if (!holding || Number(holding.shares) <= 0) {
                return { ok: false, error: 'No shares to sell' };
            }

            const heldShares = Number(holding.shares);
            const sharesToSell = amount / price;
            if (sharesToSell > heldShares * FP_TOLERANCE) {
                return { ok: false, error: 'Not enough shares' };
            }

            const actualShares = Math.min(sharesToSell, heldShares);
            const proceeds = round2(actualShares * price);
            const remainingShares = heldShares - actualShares;

            if (remainingShares < 1e-10) {
                await client.query(
                    'delete from stock_positions where player_id = $1 and symbol = $2',
                    [playerId, symbol]
                );
            } else {
                await client.query(
                    'update stock_positions set shares = $1 where player_id = $2 and symbol = $3',
                    [remainingShares, playerId, symbol]
                );
            }

            const newBalance = await addBalance(playerName, proceeds, 'stock_sell', { symbol, price, amount: proceeds }, client);
            return { ok: true, shares: actualShares, newBalance };
        });

        return txResult;
    } catch (err) {
        console.error('sellStock DB error:', err.message);
        return { ok: false, error: 'Transaction failed' };
    }
}

/**
 * @returns {Promise<string[]>}
 */
export async function getAllPortfolioPlayerNames() {
    if (!isDatabaseEnabled()) {
        return Array.from(portfolios.keys());
    }

    const result = await query(
        `select distinct p.name
         from stock_positions sp
         join players p on p.id = sp.player_id`
    );
    return result.rows.map(r => r.name);
}

/**
 * @returns {Promise<{ holdings: Array, totalValue: number }>}
 */
export async function getPortfolioSnapshot(playerName, currentPrices) {
    const priceMap = new Map(currentPrices.map(p => [p.symbol, p]));

    if (!isDatabaseEnabled()) {
        const portfolio = getPortfolioMemory(playerName);
        const holdings = [];
        let totalValue = 0;

        for (const [symbol, pos] of portfolio) {
            const quote = priceMap.get(symbol);
            const currentPrice = quote ? quote.price : pos.avgCost;
            const marketValue = pos.shares * currentPrice;
            const costBasis = pos.shares * pos.avgCost;
            const gainLoss = marketValue - costBasis;
            const gainLossPct = costBasis !== 0 ? (gainLoss / costBasis) * 100 : 0;

            holdings.push({
                symbol,
                name: quote?.name || symbol,
                shares: parseFloat(pos.shares.toFixed(6)),
                avgCost: parseFloat(pos.avgCost.toFixed(2)),
                currentPrice: parseFloat(currentPrice.toFixed(2)),
                marketValue: parseFloat(marketValue.toFixed(2)),
                gainLoss: parseFloat(gainLoss.toFixed(2)),
                gainLossPct: parseFloat(gainLossPct.toFixed(2)),
            });

            totalValue += marketValue;
        }

        return {
            holdings,
            totalValue: parseFloat(totalValue.toFixed(2)),
        };
    }

    const playerId = await getOrCreatePlayerId(playerName);
    const result = await query(
        'select symbol, shares, avg_cost from stock_positions where player_id = $1',
        [playerId]
    );

    const holdings = [];
    let totalValue = 0;

    for (const row of result.rows) {
        const symbol = row.symbol;
        const shares = Number(row.shares);
        const avgCost = Number(row.avg_cost);

        const quote = priceMap.get(symbol);
        const currentPrice = quote ? quote.price : avgCost;
        const marketValue = shares * currentPrice;
        const costBasis = shares * avgCost;
        const gainLoss = marketValue - costBasis;
        const gainLossPct = costBasis !== 0 ? (gainLoss / costBasis) * 100 : 0;

        holdings.push({
            symbol,
            name: quote?.name || symbol,
            shares: parseFloat(shares.toFixed(6)),
            avgCost: parseFloat(avgCost.toFixed(2)),
            currentPrice: parseFloat(currentPrice.toFixed(2)),
            marketValue: parseFloat(marketValue.toFixed(2)),
            gainLoss: parseFloat(gainLoss.toFixed(2)),
            gainLossPct: parseFloat(gainLossPct.toFixed(2)),
        });

        totalValue += marketValue;
    }

    return {
        holdings,
        totalValue: parseFloat(totalValue.toFixed(2)),
    };
}
