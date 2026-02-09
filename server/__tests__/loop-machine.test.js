import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerLoopMachineHandlers, cleanupLoopOnDisconnect } from '../handlers/loop-machine.js';

function createMockSocket() {
    const handlers = {};
    return {
        id: 'test-socket-1',
        handlers,
        on(event, fn) { handlers[event] = fn; },
        emit: vi.fn(),
        join: vi.fn(),
        leave: vi.fn(),
        trigger(event, data) { handlers[event]?.(data); }
    };
}

function createMockIo() {
    const roomEmit = vi.fn();
    return {
        roomEmit,
        to: vi.fn(() => ({ emit: roomEmit }))
    };
}

describe('loop-machine handler', () => {
    let socket, io, checkRateLimit, onlinePlayers;

    beforeEach(() => {
        socket = createMockSocket();
        io = createMockIo();
        checkRateLimit = vi.fn(() => true);
        onlinePlayers = new Map();
        onlinePlayers.set('test-socket-1', { name: 'TestUser' });

        registerLoopMachineHandlers(socket, io, { checkRateLimit, onlinePlayers });
    });

    describe('808 instruments in grid', () => {
        it('should include 808kick, 808hat, 808snap in the sync data on join', () => {
            socket.trigger('loop-join');

            const syncCall = socket.emit.mock.calls.find(c => c[0] === 'loop-sync');
            expect(syncCall).toBeTruthy();

            const syncData = syncCall[1];
            expect(syncData.grid).toHaveProperty('808kick');
            expect(syncData.grid).toHaveProperty('808hat');
            expect(syncData.grid).toHaveProperty('808snap');
        });

        it('should accept toggle-cell for 808kick', () => {
            socket.trigger('loop-join');
            socket.trigger('loop-toggle-cell', { instrument: '808kick', step: 0 });

            const cellUpdate = io.roomEmit.mock.calls.find(c => c[0] === 'loop-cell-updated');
            expect(cellUpdate).toBeTruthy();
            expect(cellUpdate[1].instrument).toBe('808kick');
            expect(cellUpdate[1].step).toBe(0);
            expect(cellUpdate[1].value).toBe(1);
        });

        it('should accept toggle-cell for 808hat', () => {
            socket.trigger('loop-join');
            socket.trigger('loop-toggle-cell', { instrument: '808hat', step: 3 });

            const cellUpdate = io.roomEmit.mock.calls.find(c => c[0] === 'loop-cell-updated');
            expect(cellUpdate).toBeTruthy();
            expect(cellUpdate[1].instrument).toBe('808hat');
            expect(cellUpdate[1].step).toBe(3);
            expect(cellUpdate[1].value).toBe(1);
        });

        it('should accept toggle-cell for 808snap', () => {
            socket.trigger('loop-join');
            socket.trigger('loop-toggle-cell', { instrument: '808snap', step: 7 });

            const cellUpdate = io.roomEmit.mock.calls.find(c => c[0] === 'loop-cell-updated');
            expect(cellUpdate).toBeTruthy();
            expect(cellUpdate[1].instrument).toBe('808snap');
            expect(cellUpdate[1].step).toBe(7);
            expect(cellUpdate[1].value).toBe(1);
        });

        it('should clear 808 instruments on loop-clear', () => {
            socket.trigger('loop-join');

            // Activate some cells first
            socket.trigger('loop-toggle-cell', { instrument: '808kick', step: 0 });
            socket.trigger('loop-toggle-cell', { instrument: '808hat', step: 2 });
            socket.trigger('loop-toggle-cell', { instrument: '808snap', step: 4 });

            // Clear everything
            socket.trigger('loop-clear');

            const syncCall = io.roomEmit.mock.calls.filter(c => c[0] === 'loop-sync').pop();
            expect(syncCall).toBeTruthy();
            expect(syncCall[1].grid['808kick'].every(v => v === 0)).toBe(true);
            expect(syncCall[1].grid['808hat'].every(v => v === 0)).toBe(true);
            expect(syncCall[1].grid['808snap'].every(v => v === 0)).toBe(true);
        });

        it('should resize 808 rows when bars change', () => {
            socket.trigger('loop-join');
            socket.trigger('loop-set-bars', { bars: 2 });

            const syncCall = io.roomEmit.mock.calls.filter(c => c[0] === 'loop-sync').pop();
            expect(syncCall).toBeTruthy();
            expect(syncCall[1].grid['808kick']).toHaveLength(8); // 2 bars * 4 steps
            expect(syncCall[1].grid['808hat']).toHaveLength(8);
            expect(syncCall[1].grid['808snap']).toHaveLength(8);
        });

        it('should reject invalid instrument names', () => {
            socket.trigger('loop-join');
            io.roomEmit.mockClear();

            socket.trigger('loop-toggle-cell', { instrument: 'invalid808', step: 0 });

            const cellUpdate = io.roomEmit.mock.calls.find(c => c[0] === 'loop-cell-updated');
            expect(cellUpdate).toBeUndefined();
        });
    });
});
