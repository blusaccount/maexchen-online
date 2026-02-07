import { describe, it, expect, beforeEach } from 'vitest';
import { rooms, getOpenLobbies, generateRoomCode } from '../room-manager.js';

describe('getOpenLobbies', () => {
    beforeEach(() => {
        rooms.clear();
    });

    it('returns empty array when no rooms exist', () => {
        expect(getOpenLobbies('strictbrain')).toEqual([]);
    });

    it('returns strictbrain lobbies that have not started', () => {
        const code = 'ABCD';
        rooms.set(code, {
            code,
            hostId: 'socket1',
            gameType: 'strictbrain',
            players: [{ socketId: 'socket1', name: 'Alice', character: null }],
            game: null
        });

        const lobbies = getOpenLobbies('strictbrain');
        expect(lobbies).toHaveLength(1);
        expect(lobbies[0].code).toBe('ABCD');
        expect(lobbies[0].hostName).toBe('Alice');
        expect(lobbies[0].playerCount).toBe(1);
    });

    it('does not return rooms with a different gameType', () => {
        rooms.set('ABCD', {
            code: 'ABCD',
            hostId: 'socket1',
            gameType: 'maexchen',
            players: [{ socketId: 'socket1', name: 'Alice', character: null }],
            game: null
        });

        expect(getOpenLobbies('strictbrain')).toEqual([]);
    });

    it('does not return rooms where a game has started', () => {
        rooms.set('ABCD', {
            code: 'ABCD',
            hostId: 'socket1',
            gameType: 'strictbrain',
            players: [{ socketId: 'socket1', name: 'Alice', character: null }],
            game: { someState: true }
        });

        expect(getOpenLobbies('strictbrain')).toEqual([]);
    });

    it('returns multiple open lobbies', () => {
        rooms.set('AAAA', {
            code: 'AAAA',
            hostId: 's1',
            gameType: 'strictbrain',
            players: [{ socketId: 's1', name: 'Alice', character: null }],
            game: null
        });
        rooms.set('BBBB', {
            code: 'BBBB',
            hostId: 's2',
            gameType: 'strictbrain',
            players: [
                { socketId: 's2', name: 'Bob', character: null },
                { socketId: 's3', name: 'Charlie', character: null }
            ],
            game: null
        });

        const lobbies = getOpenLobbies('strictbrain');
        expect(lobbies).toHaveLength(2);
        expect(lobbies[1].playerCount).toBe(2);
        expect(lobbies[1].players).toHaveLength(2);
    });
});

describe('generateRoomCode', () => {
    it('generates a 4-character code', () => {
        const code = generateRoomCode();
        expect(code).toHaveLength(4);
    });

    it('generates unique codes', () => {
        const codes = new Set();
        for (let i = 0; i < 50; i++) {
            codes.add(generateRoomCode());
        }
        expect(codes.size).toBe(50);
    });
});
