import { describe, it, expect } from 'vitest';
import { parseRiotId } from '../riot-api.js';

describe('riot-api: parseRiotId', () => {
    it('parses a valid Riot ID', () => {
        const result = parseRiotId('Player#EUW');
        expect(result).toEqual({ gameName: 'Player', tagLine: 'EUW' });
    });

    it('parses Riot ID with numbers in tag', () => {
        const result = parseRiotId('SummonerX#NA1');
        expect(result).toEqual({ gameName: 'SummonerX', tagLine: 'NA1' });
    });

    it('handles whitespace around the input', () => {
        const result = parseRiotId('  Player#EUW  ');
        expect(result).toEqual({ gameName: 'Player', tagLine: 'EUW' });
    });

    it('uses last hash when name contains #', () => {
        const result = parseRiotId('Name#With#EUW');
        expect(result).toEqual({ gameName: 'Name#With', tagLine: 'EUW' });
    });

    it('returns null for missing hash', () => {
        expect(parseRiotId('PlayerEUW')).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(parseRiotId('')).toBeNull();
    });

    it('returns null for non-string input', () => {
        expect(parseRiotId(null)).toBeNull();
        expect(parseRiotId(undefined)).toBeNull();
        expect(parseRiotId(123)).toBeNull();
    });

    it('returns null when gameName is too short', () => {
        expect(parseRiotId('AB#EUW')).toBeNull();
    });

    it('returns null when gameName is too long', () => {
        expect(parseRiotId('A'.repeat(17) + '#EUW')).toBeNull();
    });

    it('returns null when tagLine is too short', () => {
        expect(parseRiotId('Player#E')).toBeNull();
    });

    it('returns null when tagLine is too long', () => {
        expect(parseRiotId('Player#ABCDEF')).toBeNull();
    });

    it('returns null when hash is at beginning', () => {
        expect(parseRiotId('#EUW')).toBeNull();
    });

    it('returns null when tagLine is empty', () => {
        expect(parseRiotId('Player#')).toBeNull();
    });
});
