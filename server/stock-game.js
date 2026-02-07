// ============== STOCK GAME ==============
// Players invest StrictCoins into real stocks (1 StrictCoin = 1 USD).
// Portfolio value tracks the real market price so gains/losses mirror reality.

import { getBalance, addBalance, deductBalance } from './currency.js';

// Small tolerance for floating-point comparison when selling shares
const FP_TOLERANCE = 1.0001;

// portfolios: playerName -> Map<symbol, { shares: number, avgCost: number }>
const portfolios = new Map();

function getPortfolio(playerName) {
    if (!portfolios.has(playerName)) {
        portfolios.set(playerName, new Map());
    }
    return portfolios.get(playerName);
}

/**
 * Buy shares of a stock.
 * @param {string} playerName
 * @param {string} symbol   - e.g. "AAPL"
 * @param {number} price    - current market price per share (USD)
 * @param {number} amount   - StrictCoins to invest
 * @returns {{ ok:boolean, error?:string, shares?:number, newBalance?:number }}
 */
export function buyStock(playerName, symbol, price, amount) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        return { ok: false, error: 'Invalid amount' };
    }
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
        return { ok: false, error: 'Invalid price' };
    }
    // Round amount to 2 decimals to prevent floating-point dust
    amount = Math.round(amount * 100) / 100;

    const newBalance = deductBalance(playerName, amount);
    if (newBalance === null) {
        return { ok: false, error: 'Insufficient funds' };
    }

    const shares = amount / price; // fractional shares
    const portfolio = getPortfolio(playerName);
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

/**
 * Sell shares of a stock.
 * @param {string} playerName
 * @param {string} symbol
 * @param {number} price    - current market price per share (USD)
 * @param {number} amount   - StrictCoins worth of shares to sell (valued at current price)
 * @returns {{ ok:boolean, error?:string, shares?:number, newBalance?:number }}
 */
export function sellStock(playerName, symbol, price, amount) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        return { ok: false, error: 'Invalid amount' };
    }
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
        return { ok: false, error: 'Invalid price' };
    }

    amount = Math.round(amount * 100) / 100;
    const portfolio = getPortfolio(playerName);
    const holding = portfolio.get(symbol);

    if (!holding || holding.shares <= 0) {
        return { ok: false, error: 'No shares to sell' };
    }

    const sharesToSell = amount / price;
    if (sharesToSell > holding.shares * FP_TOLERANCE) { // tolerance for floating-point
        return { ok: false, error: 'Not enough shares' };
    }

    const actualShares = Math.min(sharesToSell, holding.shares);
    const proceeds = actualShares * price;

    holding.shares -= actualShares;
    if (holding.shares < 1e-10) {
        portfolio.delete(symbol);
    }

    const newBalance = addBalance(playerName, Math.round(proceeds * 100) / 100);
    return { ok: true, shares: actualShares, newBalance };
}

/**
 * Build a snapshot of the player's portfolio with current prices.
 * @param {string} playerName
 * @param {Array<{symbol:string, price:number, name?:string}>} currentPrices
 * @returns {{ holdings: Array, totalValue: number }}
 */
export function getPortfolioSnapshot(playerName, currentPrices) {
    const portfolio = getPortfolio(playerName);
    const priceMap = new Map(currentPrices.map(p => [p.symbol, p]));
    const holdings = [];
    let totalValue = 0;

    for (const [symbol, pos] of portfolio) {
        const quote = priceMap.get(symbol);
        const currentPrice = quote ? quote.price : pos.avgCost; // fallback
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
