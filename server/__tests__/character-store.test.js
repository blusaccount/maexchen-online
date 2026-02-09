import { describe, it, expect, vi } from 'vitest';

// Mock the db module so character-store.js never touches a real database
vi.mock('../db.js', () => ({
    isDatabaseEnabled: () => false,
    query: vi.fn()
}));

const {
    saveCharacter,
    getCharacter,
    getCharactersByNames
} = await import('../character-store.js');

describe('character-store (in-memory mode)', () => {
    const sampleCharacter = {
        pixels: [[null, '#00ff88'], ['#ff0000', null]],
        dataURL: 'data:image/png;base64,abc'
    };

    describe('saveCharacter + getCharacter', () => {
        it('returns null for unknown player', async () => {
            const ch = await getCharacter('unknown_player');
            expect(ch).toBeNull();
        });

        it('saves and retrieves a character', async () => {
            await saveCharacter('char_test_alice', sampleCharacter);
            const ch = await getCharacter('char_test_alice');
            expect(ch).toEqual(sampleCharacter);
        });

        it('does not save null character', async () => {
            await saveCharacter('char_test_null', null);
            const ch = await getCharacter('char_test_null');
            expect(ch).toBeNull();
        });

        it('overwrites previous character', async () => {
            const updated = { pixels: [[]], dataURL: 'data:image/png;base64,xyz' };
            await saveCharacter('char_test_alice', updated);
            const ch = await getCharacter('char_test_alice');
            expect(ch).toEqual(updated);
        });
    });

    describe('getCharactersByNames', () => {
        it('returns empty map for empty names array', async () => {
            const result = await getCharactersByNames([]);
            expect(result.size).toBe(0);
        });

        it('returns characters for known players', async () => {
            await saveCharacter('char_batch_a', sampleCharacter);
            await saveCharacter('char_batch_b', { pixels: [], dataURL: 'data:image/png;base64,def' });

            const result = await getCharactersByNames(['char_batch_a', 'char_batch_b', 'char_batch_missing']);
            expect(result.size).toBe(2);
            expect(result.get('char_batch_a')).toEqual(sampleCharacter);
            expect(result.get('char_batch_b')).toBeDefined();
            expect(result.has('char_batch_missing')).toBe(false);
        });
    });
});
