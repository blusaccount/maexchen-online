import { describe, it, expect, vi } from 'vitest';

// Mock the db module so tests never touch a real database
vi.mock('../db.js', () => ({
    isDatabaseEnabled: () => false,
    query: vi.fn()
}));

const {
    loadStrokes,
    saveStroke,
    deleteStroke,
    clearStrokes,
    loadMessages,
    saveMessage,
    clearMessages,
    PICTO_MAX_STROKES_DB,
    PICTO_MAX_MESSAGES
} = await import('../pictochat-store.js');

describe('pictochat-store (no DB)', () => {
    it('loadStrokes returns empty array when DB is disabled', async () => {
        const strokes = await loadStrokes();
        expect(strokes).toEqual([]);
    });

    it('loadMessages returns empty array when DB is disabled', async () => {
        const messages = await loadMessages();
        expect(messages).toEqual([]);
    });

    it('saveStroke is a no-op when DB is disabled', async () => {
        await expect(saveStroke({ strokeId: 'test' })).resolves.toBeUndefined();
    });

    it('deleteStroke is a no-op when DB is disabled', async () => {
        await expect(deleteStroke('test')).resolves.toBeUndefined();
    });

    it('clearStrokes is a no-op when DB is disabled', async () => {
        await expect(clearStrokes()).resolves.toBeUndefined();
    });

    it('saveMessage is a no-op when DB is disabled', async () => {
        await expect(saveMessage('Alice', 'hello')).resolves.toBeUndefined();
    });

    it('clearMessages is a no-op when DB is disabled', async () => {
        await expect(clearMessages()).resolves.toBeUndefined();
    });

    it('exports correct limits', () => {
        expect(PICTO_MAX_STROKES_DB).toBe(400);
        expect(PICTO_MAX_MESSAGES).toBe(200);
    });
});
