// ============== STOCK GAME ==============
// Players invest StrictCoins into real stocks (1 StrictCoin = 1 USD).
// Portfolio value tracks the real market price so gains/losses mirror reality.

import { getBalance, addBalance, deductBalance, getAllPlayerNamesMemory } from './currency.js';
import { isDatabaseEnabled, query, withTransaction } from './db.js';

// Small tolerance for floating-point comparison when selling shares
const FP_TOLERANCE = 1.0001;

// Fallback in-memory storage for local development without DATABASE_URL
const portfolios = new Map(); // playerName -> Map<symbol, { shares: number, avgCost: number }>

function round2(n) {
    return Math.round(n * 100) / 100;
}

function compareByPortfolioValueDesc(a, b) {
    if (b.portfolioValue !== a.portfolioValue) return b.portfolioValue - a.portfolioValue;
    return a.name.localeCompare(b.name);
}

function compareByPerformanceDesc(a, b) {
    if (b.performancePct !== a.performancePct) return b.performancePct - a.performancePct;
    return a.name.localeCompare(b.name);
}

function toPerformanceEntry(player) {
    let investedCapital = 0;
    for (const holding of player.holdings || []) {
        investedCapital += Number(holding.shares) * Number(holding.avgCost);
    }
    investedCapital = round2(investedCapital);
    if (investedCapital <= 0) return null;

    const openPnl = round2(player.portfolioValue - investedCapital);
    const performancePct = round2((openPnl / investedCapital) * 100);

    return {
        name: player.name,
        investedCapital,
        portfolioValue: player.portfolioValue,
        openPnl,
        performancePct
    };
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
         on conflict (name) do nothing`,
        [playerName, currentBalance]
    );

    // Fetch the id (needed whether inserted or already existed)
    const idResult = await runner.query(
        'select id from players where name = $1',
        [playerName]
    );

    return idResult.rows[0]?.id || null;
}

/**
 * Buy shares of a stock.
 * @returns {Promise<{ ok:boolean, error?:string, shares?:number, newBalance?:number }>}
 */
export async function buyStock(playerName, symbol, price, amount) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
        return { ok: false, code: 'INVALID_AMOUNT', error: 'Amount must be a positive integer' };
    }
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
        return { ok: false, code: 'INVALID_PRICE', error: 'Invalid price' };
    }

    amount = round2(amount);

    if (!isDatabaseEnabled()) {
        const newBalance = await deductBalance(playerName, amount, 'stock_buy', { symbol, price, amount });
        if (newBalance === null) {
            return { ok: false, code: 'INSUFFICIENT_FUNDS', error: 'Insufficient funds' };
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
                return { ok: false, code: 'INSUFFICIENT_FUNDS', error: 'Insufficient funds' };
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
        return { ok: false, code: 'TRANSACTION_FAILED', error: 'Transaction failed' };
    }
}

/**
 * Sell shares of a stock.
 * @returns {Promise<{ ok:boolean, error?:string, shares?:number, newBalance?:number }>}
 */
export async function sellStock(playerName, symbol, price, amount) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
        return { ok: false, code: 'INVALID_AMOUNT', error: 'Amount must be a positive integer' };
    }
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
        return { ok: false, code: 'INVALID_PRICE', error: 'Invalid price' };
    }

    amount = round2(amount);

    if (!isDatabaseEnabled()) {
        const portfolio = getPortfolioMemory(playerName);
        const holding = portfolio.get(symbol);

        if (!holding || holding.shares <= 0) {
            return { ok: false, code: 'NO_SHARES', error: 'No shares to sell' };
        }

        const sharesToSell = amount / price;
        if (sharesToSell > holding.shares * FP_TOLERANCE) {
            return { ok: false, code: 'NOT_ENOUGH_SHARES', error: 'Not enough shares' };
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
                return { ok: false, code: 'NO_SHARES', error: 'No shares to sell' };
            }

            const heldShares = Number(holding.shares);
            const sharesToSell = amount / price;
            if (sharesToSell > heldShares * FP_TOLERANCE) {
                return { ok: false, code: 'NOT_ENOUGH_SHARES', error: 'Not enough shares' };
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
        return { ok: false, code: 'TRANSACTION_FAILED', error: 'Transaction failed' };
    }
}

/**
 * @returns {Promise<string[]>}
 */
export async function getAllPortfolioPlayerNames() {
    if (!isDatabaseEnabled()) {
        // Combine players who have portfolios with players who have balances
        const names = new Set(portfolios.keys());
        for (const n of getAllPlayerNamesMemory()) names.add(n);
        return Array.from(names);
    }

    const result = await query(
        'select distinct name from players'
    );
    return result.rows.map(r => r.name);
}

/**
 * Build the full leaderboard in 2 DB queries instead of N+1.
 * @returns {Promise<Array<{ name, portfolioValue, cash, netWorth, holdings }>>}
 */
export async function getLeaderboardSnapshot(currentPrices, fetchMissingPrice) {
    const priceMap = new Map(currentPrices.map(p => [p.symbol, p]));

    if (!isDatabaseEnabled()) {
        const names = new Set(portfolios.keys());
        for (const n of getAllPlayerNamesMemory()) names.add(n);

        const leaderboard = [];
        for (const name of names) {
            const portfolio = getPortfolioMemory(name);
            const holdings = [];
            let totalValue = 0;

            for (const [symbol, pos] of portfolio) {
                let quote = priceMap.get(symbol);
                if (!quote && fetchMissingPrice) {
                    quote = await fetchMissingPrice(symbol);
                    if (quote) priceMap.set(symbol, quote);
                }
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

            const cash = await getBalance(name);
            leaderboard.push({
                name,
                portfolioValue: parseFloat(totalValue.toFixed(2)),
                cash,
                netWorth: parseFloat((totalValue + cash).toFixed(2)),
                holdings,
            });
        }
        leaderboard.sort(compareByPortfolioValueDesc);
        return leaderboard;
    }

    // 1) All players with their cash balance
    const playersResult = await query(
        'select id, name, balance from players order by name'
    );

    // 2) All stock positions in one query
    const positionsResult = await query(
        `select sp.player_id, sp.symbol, sp.shares, sp.avg_cost
         from stock_positions sp`
    );

    // Group positions by player_id
    const positionsByPlayer = new Map();
    for (const row of positionsResult.rows) {
        const pid = row.player_id;
        if (!positionsByPlayer.has(pid)) positionsByPlayer.set(pid, []);
        positionsByPlayer.get(pid).push(row);
    }

    const leaderboard = [];
    for (const player of playersResult.rows) {
        const positions = positionsByPlayer.get(player.id) || [];
        const holdings = [];
        let totalValue = 0;

        for (const row of positions) {
            const symbol = row.symbol;
            const shares = Number(row.shares);
            const avgCost = Number(row.avg_cost);
            let quote = priceMap.get(symbol);
            if (!quote && fetchMissingPrice) {
                quote = await fetchMissingPrice(symbol);
                if (quote) priceMap.set(symbol, quote);
            }
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

        const cash = Number(player.balance);
        leaderboard.push({
            name: player.name,
            portfolioValue: parseFloat(totalValue.toFixed(2)),
            cash,
            netWorth: parseFloat((totalValue + cash).toFixed(2)),
            holdings,
        });
    }

    leaderboard.sort(compareByPortfolioValueDesc);
    return leaderboard;
}

/**
 * Rank players by open trade performance (unrealized PnL %) for currently held positions.
 * Keeps the main leaderboard independent (portfolio value still primary there).
 * @returns {Promise<Array<{ name:string, investedCapital:number, portfolioValue:number, openPnl:number, performancePct:number }>>}
 */
export async function getTradePerformanceLeaderboard(currentPrices, fetchMissingPrice) {
    const portfolioLeaderboard = await getLeaderboardSnapshot(currentPrices, fetchMissingPrice);
    const performance = [];

    for (const player of portfolioLeaderboard) {
        const entry = toPerformanceEntry(player);
        if (entry) performance.push(entry);
    }

    performance.sort(compareByPerformanceDesc);
    return performance;
}

/**
 * @returns {Promise<{ holdings: Array, totalValue: number }>}
 */
export async function getPortfolioSnapshot(playerName, currentPrices, fetchMissingPrice) {
    const priceMap = new Map(currentPrices.map(p => [p.symbol, p]));

    if (!isDatabaseEnabled()) {
        const portfolio = getPortfolioMemory(playerName);
        const holdings = [];
        let totalValue = 0;

        for (const [symbol, pos] of portfolio) {
            let quote = priceMap.get(symbol);
            if (!quote && fetchMissingPrice) {
                quote = await fetchMissingPrice(symbol);
                if (quote) priceMap.set(symbol, quote);
            }
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
        let resolvedQuote = quote;
        if (!resolvedQuote && fetchMissingPrice) {
            resolvedQuote = await fetchMissingPrice(symbol);
            if (resolvedQuote) priceMap.set(symbol, resolvedQuote);
        }
        const currentPrice = resolvedQuote ? resolvedQuote.price : avgCost;
        const marketValue = shares * currentPrice;
        const costBasis = shares * avgCost;
        const gainLoss = marketValue - costBasis;
        const gainLossPct = costBasis !== 0 ? (gainLoss / costBasis) * 100 : 0;

        holdings.push({
            symbol,
            name: resolvedQuote?.name || symbol,
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
