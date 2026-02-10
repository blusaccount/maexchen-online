import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerWatchpartyHandlers } from '../handlers/watchparty.js';

function createMockSocket() {
    const handlers = {};
    return {
        id: 'test-socket-1',
        handlers,
        on(event, fn) { handlers[event] = fn; },
        emit: vi.fn(),
        to: vi.fn(() => ({ emit: vi.fn() })),
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

describe('watchparty handler', () => {
    let socket, io, checkRateLimit, getRoom, room;

    beforeEach(() => {
        socket = createMockSocket();
        io = createMockIo();
        checkRateLimit = vi.fn(() => true);
        room = {
            code: 'ABCD',
            gameType: 'watchparty',
            players: [{ socketId: 'test-socket-1', name: 'Alice' }],
            watchparty: { videoId: 'dQw4w9WgXcQ', state: 'playing', time: 42, updatedAt: Date.now() }
        };
        getRoom = vi.fn(() => room);

        registerWatchpartyHandlers(socket, io, { checkRateLimit, getRoom });
    });

    describe('watchparty-heartbeat', () => {
        it('should respond with heartbeat-ack when in a watchparty room', () => {
            socket.trigger('watchparty-heartbeat');

            const ackCall = socket.emit.mock.calls.find(c => c[0] === 'watchparty-heartbeat-ack');
            expect(ackCall).toBeTruthy();
        });

        it('should not respond if rate limited', () => {
            checkRateLimit.mockReturnValue(false);
            socket.trigger('watchparty-heartbeat');

            expect(socket.emit).not.toHaveBeenCalled();
        });

        it('should not respond if not in a room', () => {
            getRoom.mockReturnValue(null);
            socket.trigger('watchparty-heartbeat');

            expect(socket.emit).not.toHaveBeenCalled();
        });

        it('should not respond if room is not a watchparty', () => {
            room.gameType = 'maexchen';
            socket.trigger('watchparty-heartbeat');

            expect(socket.emit).not.toHaveBeenCalled();
        });
    });

    describe('watchparty-load', () => {
        it('should broadcast video to room on valid load', () => {
            socket.trigger('watchparty-load', 'dQw4w9WgXcQ');

            const videoCall = io.roomEmit.mock.calls.find(c => c[0] === 'watchparty-video');
            expect(videoCall).toBeTruthy();
            expect(videoCall[1].videoId).toBe('dQw4w9WgXcQ');
            expect(videoCall[1].state).toBe('paused');
            expect(videoCall[1].time).toBe(0);
        });

        it('should reject invalid video IDs', () => {
            socket.trigger('watchparty-load', '');

            expect(io.roomEmit).not.toHaveBeenCalled();
        });
    });

    describe('watchparty-request-sync', () => {
        it('should send current video state to requester', () => {
            socket.trigger('watchparty-request-sync');

            const videoCall = socket.emit.mock.calls.find(c => c[0] === 'watchparty-video');
            expect(videoCall).toBeTruthy();
            expect(videoCall[1].videoId).toBe('dQw4w9WgXcQ');
            expect(videoCall[1].state).toBe('playing');
            expect(videoCall[1].time).toBe(42);
        });
    });
});
