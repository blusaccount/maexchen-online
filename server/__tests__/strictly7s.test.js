import { describe, it, expect } from 'vitest';
import {
    pickStrictly7sSymbol,
    evaluateStrictly7sSpin,
    STRICTLY7S_SYMBOLS,
    STRICTLY7S_TOTAL_WEIGHT
} from '../handlers/strictly7s.js';

describe('pickStrictly7sSymbol', () => {
    it('returns a valid symbol object every time', () => {
        const validIds = STRICTLY7S_SYMBOLS.map(s => s.id);
        
        for (let i = 0; i < 100; i++) {
            const symbol = pickStrictly7sSymbol();
            expect(symbol).toBeDefined();
            expect(symbol).toHaveProperty('id');
            expect(symbol).toHaveProperty('weight');
            expect(symbol).toHaveProperty('multiplier');
            expect(validIds).toContain(symbol.id);
        }
    });

    it('returns symbols with expected structure', () => {
        const symbol = pickStrictly7sSymbol();
        expect(typeof symbol.id).toBe('string');
        expect(typeof symbol.weight).toBe('number');
        expect(typeof symbol.multiplier).toBe('number');
        expect(symbol.weight).toBeGreaterThan(0);
        expect(symbol.multiplier).toBeGreaterThan(0);
    });
});

describe('evaluateStrictly7sSpin', () => {
    const SEVEN = STRICTLY7S_SYMBOLS.find(s => s.id === 'SEVEN');
    const BAR = STRICTLY7S_SYMBOLS.find(s => s.id === 'BAR');
    const DIAMOND = STRICTLY7S_SYMBOLS.find(s => s.id === 'DIAMOND');
    const BELL = STRICTLY7S_SYMBOLS.find(s => s.id === 'BELL');
    const CHERRY = STRICTLY7S_SYMBOLS.find(s => s.id === 'CHERRY');
    const LEMON = STRICTLY7S_SYMBOLS.find(s => s.id === 'LEMON');

    describe('three-of-a-kind wins', () => {
        it('returns correct multiplier and winType for 3x SEVEN', () => {
            const result = evaluateStrictly7sSpin([SEVEN, SEVEN, SEVEN]);
            expect(result.multiplier).toBe(SEVEN.multiplier);
            expect(result.winType).toBe('three-kind');
            expect(result.symbol).toBe('SEVEN');
        });

        it('returns correct multiplier and winType for 3x BAR', () => {
            const result = evaluateStrictly7sSpin([BAR, BAR, BAR]);
            expect(result.multiplier).toBe(BAR.multiplier);
            expect(result.winType).toBe('three-kind');
            expect(result.symbol).toBe('BAR');
        });

        it('returns correct multiplier and winType for 3x DIAMOND', () => {
            const result = evaluateStrictly7sSpin([DIAMOND, DIAMOND, DIAMOND]);
            expect(result.multiplier).toBe(DIAMOND.multiplier);
            expect(result.winType).toBe('three-kind');
            expect(result.symbol).toBe('DIAMOND');
        });

        it('returns correct multiplier and winType for 3x BELL', () => {
            const result = evaluateStrictly7sSpin([BELL, BELL, BELL]);
            expect(result.multiplier).toBe(BELL.multiplier);
            expect(result.winType).toBe('three-kind');
            expect(result.symbol).toBe('BELL');
        });

        it('returns correct multiplier and winType for 3x CHERRY', () => {
            const result = evaluateStrictly7sSpin([CHERRY, CHERRY, CHERRY]);
            expect(result.multiplier).toBe(CHERRY.multiplier);
            expect(result.winType).toBe('three-kind');
            expect(result.symbol).toBe('CHERRY');
        });

        it('returns correct multiplier and winType for 3x LEMON', () => {
            const result = evaluateStrictly7sSpin([LEMON, LEMON, LEMON]);
            expect(result.multiplier).toBe(LEMON.multiplier);
            expect(result.winType).toBe('three-kind');
            expect(result.symbol).toBe('LEMON');
        });
    });

    describe('two-cherry partial win', () => {
        it('returns multiplier 2 for exactly 2 cherries (CHERRY, CHERRY, SEVEN)', () => {
            const result = evaluateStrictly7sSpin([CHERRY, CHERRY, SEVEN]);
            expect(result.multiplier).toBe(2);
            expect(result.winType).toBe('two-cherries');
            expect(result.symbol).toBe('CHERRY');
        });

        it('returns multiplier 2 for exactly 2 cherries (SEVEN, CHERRY, CHERRY)', () => {
            const result = evaluateStrictly7sSpin([SEVEN, CHERRY, CHERRY]);
            expect(result.multiplier).toBe(2);
            expect(result.winType).toBe('two-cherries');
            expect(result.symbol).toBe('CHERRY');
        });

        it('returns multiplier 2 for exactly 2 cherries (CHERRY, LEMON, CHERRY)', () => {
            const result = evaluateStrictly7sSpin([CHERRY, LEMON, CHERRY]);
            expect(result.multiplier).toBe(2);
            expect(result.winType).toBe('two-cherries');
            expect(result.symbol).toBe('CHERRY');
        });

        it('does NOT trigger two-cherry win for 3 cherries (handled by three-of-a-kind)', () => {
            const result = evaluateStrictly7sSpin([CHERRY, CHERRY, CHERRY]);
            expect(result.winType).toBe('three-kind');
            expect(result.multiplier).toBe(CHERRY.multiplier);
        });

        it('returns multiplier 0 for only 1 cherry', () => {
            const result = evaluateStrictly7sSpin([CHERRY, SEVEN, LEMON]);
            expect(result.multiplier).toBe(0);
            expect(result.winType).toBe('none');
        });
    });

    describe('no match (loss)', () => {
        it('returns multiplier 0 for no match', () => {
            const result = evaluateStrictly7sSpin([SEVEN, BAR, LEMON]);
            expect(result.multiplier).toBe(0);
            expect(result.winType).toBe('none');
            expect(result.symbol).toBe(null);
        });

        it('returns multiplier 0 for different symbols with no cherries', () => {
            const result = evaluateStrictly7sSpin([BELL, DIAMOND, LEMON]);
            expect(result.multiplier).toBe(0);
            expect(result.winType).toBe('none');
        });
    });

    describe('invalid input handling', () => {
        it('returns multiplier 0 for non-array input', () => {
            const result = evaluateStrictly7sSpin(null);
            expect(result.multiplier).toBe(0);
            expect(result.winType).toBe('none');
        });

        it('returns multiplier 0 for array with wrong length', () => {
            const result = evaluateStrictly7sSpin([SEVEN, BAR]);
            expect(result.multiplier).toBe(0);
            expect(result.winType).toBe('none');
        });

        it('returns multiplier 0 for empty array', () => {
            const result = evaluateStrictly7sSpin([]);
            expect(result.multiplier).toBe(0);
            expect(result.winType).toBe('none');
        });

        it('returns multiplier 0 for array with too many elements', () => {
            const result = evaluateStrictly7sSpin([SEVEN, BAR, LEMON, CHERRY]);
            expect(result.multiplier).toBe(0);
            expect(result.winType).toBe('none');
        });
    });
});

describe('RTP simulation test', () => {
    it('should achieve 87-92% RTP over 1,000,000 spins', { timeout: 30000 }, () => {
        const numSpins = 1000000;
        let totalBet = 0;
        let totalPayout = 0;

        for (let i = 0; i < numSpins; i++) {
            // Simulate a single spin with bet of 1
            const bet = 1;
            totalBet += bet;

            const reels = [pickStrictly7sSymbol(), pickStrictly7sSymbol(), pickStrictly7sSymbol()];
            const outcome = evaluateStrictly7sSpin(reels);

            if (outcome.multiplier > 0) {
                totalPayout += bet * outcome.multiplier;
            }
        }

        const actualRTP = (totalPayout / totalBet) * 100;

        // Expected RTP: 89.78%, with ±2% tolerance (87-92%)
        expect(actualRTP).toBeGreaterThanOrEqual(87);
        expect(actualRTP).toBeLessThanOrEqual(92);

        // Log the actual RTP for verification
        console.log(`RTP over ${numSpins.toLocaleString()} spins: ${actualRTP.toFixed(4)}%`);
        console.log(`Total bet: ${totalBet.toLocaleString()}, Total payout: ${totalPayout.toLocaleString()}`);
    });
});

describe('Symbol configuration', () => {
    it('has correct total weight', () => {
        const expectedWeight = STRICTLY7S_SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
        expect(STRICTLY7S_TOTAL_WEIGHT).toBe(expectedWeight);
        expect(STRICTLY7S_TOTAL_WEIGHT).toBe(28);
    });

    it('has 6 symbols', () => {
        expect(STRICTLY7S_SYMBOLS).toHaveLength(6);
    });

    it('has expected symbol IDs', () => {
        const ids = STRICTLY7S_SYMBOLS.map(s => s.id);
        expect(ids).toContain('SEVEN');
        expect(ids).toContain('BAR');
        expect(ids).toContain('DIAMOND');
        expect(ids).toContain('BELL');
        expect(ids).toContain('CHERRY');
        expect(ids).toContain('LEMON');
    });

    it('has valid weights and multipliers', () => {
        STRICTLY7S_SYMBOLS.forEach(symbol => {
            expect(symbol.weight).toBeGreaterThan(0);
            expect(symbol.multiplier).toBeGreaterThan(0);
            expect(Number.isInteger(symbol.weight)).toBe(true);
            expect(Number.isInteger(symbol.multiplier)).toBe(true);
        });
    });
});
