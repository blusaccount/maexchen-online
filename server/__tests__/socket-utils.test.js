import { describe, it, expect } from 'vitest';

import {
    sanitizeName,
    validateCharacter,
    validateRoomCode,
    validateGameType,
    validateYouTubeId,
    normalizePoint,
    sanitizeColor,
    sanitizeSize,
    getSocketIp
} from '../socket-utils.js';

describe('sanitizeName', () => {
    it('returns trimmed name for valid input', () => {
        expect(sanitizeName('Alice')).toBe('Alice');
    });

    it('strips HTML special characters', () => {
        expect(sanitizeName('<script>alert(1)</script>')).toBe('scriptalert(1)script');
    });

    it('returns empty for non-string', () => {
        expect(sanitizeName(null)).toBe('');
        expect(sanitizeName(123)).toBe('');
        expect(sanitizeName(undefined)).toBe('');
    });

    it('returns empty for too-short names', () => {
        expect(sanitizeName('A')).toBe('');
        expect(sanitizeName('')).toBe('');
    });

    it('truncates to 20 characters', () => {
        const long = 'A'.repeat(30);
        expect(sanitizeName(long).length).toBe(20);
    });

    it('strips quotes and slashes', () => {
        expect(sanitizeName("it's me")).toBe('its me');
        expect(sanitizeName('a"b')).toBe('ab');
        expect(sanitizeName('a/b')).toBe('ab');
    });
});

describe('validateCharacter', () => {
    it('returns null for non-objects', () => {
        expect(validateCharacter(null)).toBeNull();
        expect(validateCharacter('string')).toBeNull();
        expect(validateCharacter(42)).toBeNull();
    });

    it('only keeps allowed keys', () => {
        const result = validateCharacter({ pixels: [[1]], evil: 'data', dataURL: 'data:image/png;base64,abc' });
        expect(result).toHaveProperty('pixels');
        expect(result).toHaveProperty('dataURL');
        expect(result).not.toHaveProperty('evil');
    });

    it('rejects oversized character data', () => {
        const huge = { pixels: 'x'.repeat(5000) };
        expect(validateCharacter(huge)).toBeNull();
    });

    it('removes invalid dataURL', () => {
        const result = validateCharacter({ dataURL: 'javascript:alert(1)' });
        expect(result.dataURL).toBeUndefined();
    });
});

describe('validateRoomCode', () => {
    it('returns uppercased alphanumeric code', () => {
        expect(validateRoomCode('AB12')).toBe('AB12');
    });

    it('strips non-alphanumeric characters', () => {
        expect(validateRoomCode('A!B@')).toBe('AB');
    });

    it('truncates to 4 characters', () => {
        expect(validateRoomCode('ABCDEF')).toBe('ABCD');
    });

    it('returns empty for non-string', () => {
        expect(validateRoomCode(123)).toBe('');
        expect(validateRoomCode(null)).toBe('');
    });
});

describe('validateGameType', () => {
    it('returns valid game types', () => {
        expect(validateGameType('maexchen')).toBe('maexchen');
        expect(validateGameType('watchparty')).toBe('watchparty');
        expect(validateGameType('stocks')).toBe('stocks');
        expect(validateGameType('strictbrain')).toBe('strictbrain');
    });

    it('returns default for invalid types', () => {
        expect(validateGameType('unknown')).toBe('maexchen');
        expect(validateGameType('')).toBe('maexchen');
        expect(validateGameType(123)).toBe('maexchen');
    });
});

describe('validateYouTubeId', () => {
    it('returns valid YouTube ID', () => {
        expect(validateYouTubeId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('strips invalid characters', () => {
        expect(validateYouTubeId('abc<>!def')).toBe('abcdef');
    });

    it('truncates to 11 characters', () => {
        expect(validateYouTubeId('abcdefghijklmno')).toBe('abcdefghijk');
    });

    it('returns empty for non-string', () => {
        expect(validateYouTubeId(null)).toBe('');
    });
});

describe('normalizePoint', () => {
    it('returns valid point within bounds', () => {
        expect(normalizePoint({ x: 0.5, y: 0.5 })).toEqual({ x: 0.5, y: 0.5 });
    });

    it('accepts boundary values', () => {
        expect(normalizePoint({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
        expect(normalizePoint({ x: 1, y: 1 })).toEqual({ x: 1, y: 1 });
    });

    it('rejects out-of-bounds values', () => {
        expect(normalizePoint({ x: -0.1, y: 0.5 })).toBeNull();
        expect(normalizePoint({ x: 0.5, y: 1.1 })).toBeNull();
    });

    it('rejects non-finite values', () => {
        expect(normalizePoint({ x: NaN, y: 0.5 })).toBeNull();
        expect(normalizePoint({ x: Infinity, y: 0.5 })).toBeNull();
    });

    it('rejects non-objects', () => {
        expect(normalizePoint(null)).toBeNull();
        expect(normalizePoint('string')).toBeNull();
    });
});

describe('sanitizeColor', () => {
    it('returns valid hex colors', () => {
        expect(sanitizeColor('#ff0000')).toBe('#ff0000');
        expect(sanitizeColor('#AABBCC')).toBe('#AABBCC');
    });

    it('returns default for invalid colors', () => {
        expect(sanitizeColor('#fff')).toBe('#000000');
        expect(sanitizeColor('red')).toBe('#000000');
        expect(sanitizeColor('#gggggg')).toBe('#000000');
        expect(sanitizeColor(123)).toBe('#000000');
    });
});

describe('sanitizeSize', () => {
    it('clamps to valid range', () => {
        expect(sanitizeSize(4)).toBe(4);
        expect(sanitizeSize(1)).toBe(1);
        expect(sanitizeSize(18)).toBe(18);
    });

    it('clamps values out of range', () => {
        expect(sanitizeSize(0)).toBe(1);
        expect(sanitizeSize(-5)).toBe(1);
        expect(sanitizeSize(100)).toBe(18);
    });

    it('returns default for non-finite', () => {
        expect(sanitizeSize('abc')).toBe(4);
        expect(sanitizeSize(NaN)).toBe(4);
    });
});

describe('getSocketIp', () => {
    it('extracts IP from x-forwarded-for header', () => {
        const socket = {
            handshake: {
                headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
                address: '127.0.0.1'
            }
        };
        expect(getSocketIp(socket)).toBe('1.2.3.4');
    });

    it('falls back to handshake address', () => {
        const socket = {
            handshake: {
                headers: {},
                address: '10.0.0.1'
            }
        };
        expect(getSocketIp(socket)).toBe('10.0.0.1');
    });

    it('returns unknown for missing data', () => {
        expect(getSocketIp(null)).toBe('unknown');
        expect(getSocketIp({})).toBe('unknown');
    });
});
