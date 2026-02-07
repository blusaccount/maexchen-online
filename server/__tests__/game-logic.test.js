import { describe, it, expect } from 'vitest';
import {
    ROLL_ORDER,
    STARTING_LIVES,
    rollRank,
    rollName,
    rollDice,
    isMaexchen,
    getAlivePlayers,
    nextAlivePlayerIndex
} from '../game-logic.js';

describe('ROLL_ORDER', () => {
    it('has 21 entries', () => {
        expect(ROLL_ORDER).toHaveLength(21);
    });

    it('ends with Mäxchen (21)', () => {
        expect(ROLL_ORDER[ROLL_ORDER.length - 1]).toBe(21);
    });
});

describe('rollRank', () => {
    it('returns the index of a value in ROLL_ORDER', () => {
        expect(rollRank(31)).toBe(0);
        expect(rollRank(21)).toBe(20);
    });

    it('returns -1 for values not in ROLL_ORDER', () => {
        expect(rollRank(99)).toBe(-1);
    });

    it('ranks Mäxchen highest', () => {
        for (const val of ROLL_ORDER) {
            if (val !== 21) {
                expect(rollRank(21)).toBeGreaterThan(rollRank(val));
            }
        }
    });

    it('ranks Pasche higher than normals', () => {
        expect(rollRank(11)).toBeGreaterThan(rollRank(65));
    });
});

describe('rollName', () => {
    it('returns "Mäxchen!" for 21', () => {
        expect(rollName(21)).toBe('Mäxchen!');
    });

    it('returns "Pasch Xer" for doubles', () => {
        expect(rollName(33)).toBe('Pasch 3er');
        expect(rollName(55)).toBe('Pasch 5er');
    });

    it('returns string of value for normals', () => {
        expect(rollName(31)).toBe('31');
        expect(rollName(64)).toBe('64');
    });
});

describe('rollDice', () => {
    it('returns an object with d1, d2, and value', () => {
        const roll = rollDice();
        expect(roll).toHaveProperty('d1');
        expect(roll).toHaveProperty('d2');
        expect(roll).toHaveProperty('value');
    });

    it('always has d1 >= d2', () => {
        for (let i = 0; i < 100; i++) {
            const roll = rollDice();
            expect(roll.d1).toBeGreaterThanOrEqual(roll.d2);
        }
    });

    it('produces dice values between 1 and 6', () => {
        for (let i = 0; i < 100; i++) {
            const roll = rollDice();
            expect(roll.d1).toBeGreaterThanOrEqual(1);
            expect(roll.d1).toBeLessThanOrEqual(6);
            expect(roll.d2).toBeGreaterThanOrEqual(1);
            expect(roll.d2).toBeLessThanOrEqual(6);
        }
    });

    it('computes value as d1 * 10 + d2', () => {
        for (let i = 0; i < 100; i++) {
            const roll = rollDice();
            expect(roll.value).toBe(roll.d1 * 10 + roll.d2);
        }
    });

    it('always produces a value in ROLL_ORDER', () => {
        for (let i = 0; i < 100; i++) {
            const roll = rollDice();
            expect(ROLL_ORDER).toContain(roll.value);
        }
    });
});

describe('isMaexchen', () => {
    it('returns true for 21', () => {
        expect(isMaexchen(21)).toBe(true);
    });

    it('returns false for other values', () => {
        expect(isMaexchen(31)).toBe(false);
        expect(isMaexchen(66)).toBe(false);
        expect(isMaexchen(11)).toBe(false);
    });
});

describe('STARTING_LIVES', () => {
    it('equals 3', () => {
        expect(STARTING_LIVES).toBe(3);
    });
});

describe('getAlivePlayers', () => {
    it('returns only players with lives > 0', () => {
        const game = {
            players: [
                { name: 'Alice', lives: 3 },
                { name: 'Bob', lives: 0 },
                { name: 'Charlie', lives: 1 }
            ]
        };
        const alive = getAlivePlayers(game);
        expect(alive).toHaveLength(2);
        expect(alive.map(p => p.name)).toEqual(['Alice', 'Charlie']);
    });

    it('returns empty array when no players are alive', () => {
        const game = {
            players: [
                { name: 'Alice', lives: 0 },
                { name: 'Bob', lives: 0 }
            ]
        };
        expect(getAlivePlayers(game)).toHaveLength(0);
    });
});

describe('nextAlivePlayerIndex', () => {
    it('skips dead players', () => {
        const game = {
            players: [
                { name: 'Alice', lives: 3 },
                { name: 'Bob', lives: 0 },
                { name: 'Charlie', lives: 1 }
            ]
        };
        // From Alice (index 0), next alive is Charlie (index 2)
        expect(nextAlivePlayerIndex(game, 0)).toBe(2);
    });

    it('wraps around to the beginning', () => {
        const game = {
            players: [
                { name: 'Alice', lives: 2 },
                { name: 'Bob', lives: 0 },
                { name: 'Charlie', lives: 1 }
            ]
        };
        // From Charlie (index 2), next alive is Alice (index 0)
        expect(nextAlivePlayerIndex(game, 2)).toBe(0);
    });

    it('returns next index when all are alive', () => {
        const game = {
            players: [
                { name: 'Alice', lives: 3 },
                { name: 'Bob', lives: 3 },
                { name: 'Charlie', lives: 3 }
            ]
        };
        expect(nextAlivePlayerIndex(game, 0)).toBe(1);
        expect(nextAlivePlayerIndex(game, 1)).toBe(2);
        expect(nextAlivePlayerIndex(game, 2)).toBe(0);
    });
});
