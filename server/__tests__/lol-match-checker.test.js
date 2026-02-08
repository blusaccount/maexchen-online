import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the dependencies
vi.mock('../db.js', () => ({
    isDatabaseEnabled: () => false,
    query: vi.fn(),
    withTransaction: vi.fn()
}));

// Mock riot-api functions
const mockIsRiotApiEnabled = vi.fn();
const mockGetRiotApiDisabledReason = vi.fn();
const mockGetMatchHistory = vi.fn();
const mockGetMatchDetails = vi.fn();
const mockValidateRiotId = vi.fn();

vi.mock('../riot-api.js', () => ({
    isRiotApiEnabled: mockIsRiotApiEnabled,
    getRiotApiDisabledReason: mockGetRiotApiDisabledReason,
    getMatchHistory: mockGetMatchHistory,
    getMatchDetails: mockGetMatchDetails,
    validateRiotId: mockValidateRiotId
}));

// Mock currency and lol-betting functions
const mockAddBalance = vi.fn();
const mockResolveBet = vi.fn();
const mockGetBetById = vi.fn();
const mockGetActiveBets = vi.fn();

vi.mock('../currency.js', () => ({
    addBalance: mockAddBalance
}));

vi.mock('../lol-betting.js', () => ({
    getBetById: mockGetBetById,
    resolveBet: mockResolveBet,
    getActiveBets: mockGetActiveBets,
    getPendingBetsForChecking: vi.fn(),
    getPendingBetsWithoutPuuid: vi.fn(),
    updateBetPuuid: vi.fn()
}));

const { manualCheckBetStatus } = await import('../lol-match-checker.js');

describe('manualCheckBetStatus', () => {
    let betIdCounter = 1;

    beforeEach(() => {
        vi.clearAllMocks();
        mockIsRiotApiEnabled.mockReturnValue(true);
        mockGetRiotApiDisabledReason.mockReturnValue('');
        // Use large random starting point to avoid conflicts between tests
        betIdCounter = Math.floor(Math.random() * 100000) + 1000;
    });

    it('returns rate limit error when called too quickly', async () => {
        const betId = betIdCounter++;
        const playerName = 'testPlayer';

        mockGetBetById.mockResolvedValue({
            id: betId,
            playerName,
            status: 'pending',
            puuid: 'test-puuid',
            lastMatchId: 'match-1',
            betOnWin: true,
            amount: 100
        });

        // First call should succeed
        mockGetMatchHistory.mockResolvedValue([]);
        const result1 = await manualCheckBetStatus(betId, playerName);
        expect(result1.success).toBe(true);

        // Immediate second call should be rate limited
        const result2 = await manualCheckBetStatus(betId, playerName);
        expect(result2.success).toBe(false);
        expect(result2.error).toBe('RATE_LIMITED');
        expect(result2.message).toContain('cooldown');
    });

    it('returns error when Riot API is not configured', async () => {
        const betId = betIdCounter++;
        mockIsRiotApiEnabled.mockReturnValue(false);
        mockGetRiotApiDisabledReason.mockReturnValue('');

        const result = await manualCheckBetStatus(betId, 'testPlayer');
        expect(result.success).toBe(false);
        expect(result.error).toBe('API_NOT_CONFIGURED');
        expect(result.message).toContain('not configured');
    });

    it('returns error when Riot API key is rejected', async () => {
        const betId = betIdCounter++;
        mockIsRiotApiEnabled.mockReturnValue(false);
        mockGetRiotApiDisabledReason.mockReturnValue('API key rejected (403)');

        const result = await manualCheckBetStatus(betId, 'testPlayer');
        expect(result.success).toBe(false);
        expect(result.error).toBe('API_REJECTED');
        expect(result.message).toContain('rejected');
    });

    it('returns error when bet is not found', async () => {
        const betId = betIdCounter++;
        mockGetBetById.mockResolvedValue(null);

        const result = await manualCheckBetStatus(betId, 'testPlayer');
        expect(result.success).toBe(false);
        expect(result.error).toBe('BET_NOT_FOUND');
        expect(result.message).toContain('not found');
    });

    it('returns error when player does not own the bet', async () => {
        const betId = betIdCounter++;
        mockGetBetById.mockResolvedValue({
            id: betId,
            playerName: 'otherPlayer',
            status: 'pending',
            puuid: 'test-puuid',
            lastMatchId: 'match-1'
        });

        const result = await manualCheckBetStatus(betId, 'testPlayer');
        expect(result.success).toBe(false);
        expect(result.error).toBe('PERMISSION_DENIED');
        expect(result.message).toContain('your own bets');
    });

    it('returns error when bet is already resolved', async () => {
        const betId = betIdCounter++;
        mockGetBetById.mockResolvedValue({
            id: betId,
            playerName: 'testPlayer',
            status: 'resolved',
            puuid: 'test-puuid',
            lastMatchId: 'match-1'
        });

        const result = await manualCheckBetStatus(betId, 'testPlayer');
        expect(result.success).toBe(false);
        expect(result.error).toBe('BET_NOT_PENDING');
        expect(result.message).toContain('already resolved');
    });

    it('returns error when bet is missing puuid or lastMatchId', async () => {
        const betId = betIdCounter++;
        mockGetBetById.mockResolvedValue({
            id: betId,
            playerName: 'testPlayer',
            status: 'pending',
            puuid: null,
            lastMatchId: null
        });

        const result = await manualCheckBetStatus(betId, 'testPlayer');
        expect(result.success).toBe(false);
        expect(result.error).toBe('MISSING_DATA');
        expect(result.message).toContain('missing player information');
    });

    it('returns no new match when match history is empty', async () => {
        const betId = betIdCounter++;
        mockGetBetById.mockResolvedValue({
            id: betId,
            playerName: 'testPlayer',
            status: 'pending',
            puuid: 'test-puuid',
            lastMatchId: 'match-1',
            betOnWin: true,
            amount: 100
        });

        mockGetMatchHistory.mockResolvedValue([]);

        const result = await manualCheckBetStatus(betId, 'testPlayer');
        expect(result.success).toBe(true);
        expect(result.resolved).toBe(false);
        expect(result.message).toContain('No new match');
    });

    it('returns no new match when lastMatchId is the most recent', async () => {
        const betId = betIdCounter++;
        mockGetBetById.mockResolvedValue({
            id: betId,
            playerName: 'testPlayer',
            status: 'pending',
            puuid: 'test-puuid',
            lastMatchId: 'match-1',
            betOnWin: true,
            amount: 100
        });

        // lastMatchId is the most recent match (index 0)
        mockGetMatchHistory.mockResolvedValue(['match-1', 'match-0']);

        const result = await manualCheckBetStatus(betId, 'testPlayer');
        expect(result.success).toBe(true);
        expect(result.resolved).toBe(false);
        expect(result.message).toContain('No new match');
    });

    it('resolves bet when lastMatchId is most recent but match ended after bet placement', async () => {
        const betId = betIdCounter++;
        const bet = {
            id: betId,
            playerName: 'testPlayer',
            status: 'pending',
            puuid: 'test-puuid',
            lastMatchId: 'match-1',
            betOnWin: true,
            amount: 100,
            lolUsername: 'TestPlayer#NA1',
            createdAt: '2024-01-01T00:00:00.000Z'
        };

        mockGetBetById.mockResolvedValue(bet);
        mockGetMatchHistory.mockResolvedValue(['match-1']);
        mockGetMatchDetails.mockResolvedValue({
            info: {
                gameEndTimestamp: 1704067800000,
                participants: [
                    { puuid: 'test-puuid', win: true }
                ]
            }
        });
        mockResolveBet.mockResolvedValue({
            playerId: 1,
            playerName: 'testPlayer',
            wonBet: true,
            payout: 200
        });
        mockAddBalance.mockResolvedValue(300);

        const result = await manualCheckBetStatus(betId, 'testPlayer');
        expect(result.success).toBe(true);
        expect(result.resolved).toBe(true);
        expect(result.wonBet).toBe(true);
        expect(result.payout).toBe(200);
    });

    it('resolves bet when new match is found and player won', async () => {
        const betId = betIdCounter++;
        const bet = {
            id: betId,
            playerName: 'testPlayer',
            status: 'pending',
            puuid: 'test-puuid',
            lastMatchId: 'match-1',
            betOnWin: true,
            amount: 100,
            lolUsername: 'TestPlayer#NA1'
        };

        mockGetBetById.mockResolvedValue(bet);
        mockGetMatchHistory.mockResolvedValue(['match-2', 'match-1']);
        mockGetMatchDetails.mockResolvedValue({
            info: {
                participants: [
                    { puuid: 'test-puuid', win: true }
                ]
            }
        });
        mockResolveBet.mockResolvedValue({
            playerId: 1,
            playerName: 'testPlayer',
            wonBet: true,
            payout: 200
        });
        mockAddBalance.mockResolvedValue(300);

        const result = await manualCheckBetStatus(betId, 'testPlayer');
        expect(result.success).toBe(true);
        expect(result.resolved).toBe(true);
        expect(result.wonBet).toBe(true);
        expect(result.payout).toBe(200);
        expect(result.message).toContain('won');
        expect(mockResolveBet).toHaveBeenCalledWith(betId, true);
    });

    it('resolves bet when new match is found and player lost', async () => {
        const betId = betIdCounter++;
        const bet = {
            id: betId,
            playerName: 'testPlayer',
            status: 'pending',
            puuid: 'test-puuid',
            lastMatchId: 'match-1',
            betOnWin: true,
            amount: 100,
            lolUsername: 'TestPlayer#NA1'
        };

        mockGetBetById.mockResolvedValue(bet);
        mockGetMatchHistory.mockResolvedValue(['match-2', 'match-1']);
        mockGetMatchDetails.mockResolvedValue({
            info: {
                participants: [
                    { puuid: 'test-puuid', win: false }
                ]
            }
        });
        mockResolveBet.mockResolvedValue({
            playerId: 1,
            playerName: 'testPlayer',
            wonBet: false,
            payout: 0
        });

        const result = await manualCheckBetStatus(betId, 'testPlayer');
        expect(result.success).toBe(true);
        expect(result.resolved).toBe(true);
        expect(result.wonBet).toBe(false);
        expect(result.payout).toBe(0);
        expect(result.message).toContain('lost');
        expect(mockResolveBet).toHaveBeenCalledWith(betId, false);
    });

    it('returns error when match data is invalid', async () => {
        const betId = betIdCounter++;
        mockGetBetById.mockResolvedValue({
            id: betId,
            playerName: 'testPlayer',
            status: 'pending',
            puuid: 'test-puuid',
            lastMatchId: 'match-1',
            betOnWin: true,
            amount: 100
        });

        mockGetMatchHistory.mockResolvedValue(['match-2', 'match-1']);
        mockGetMatchDetails.mockResolvedValue(null);

        const result = await manualCheckBetStatus(betId, 'testPlayer');
        expect(result.success).toBe(false);
        expect(result.error).toBe('INVALID_MATCH_DATA');
        expect(result.message).toContain('incomplete or invalid');
    });

    it('returns error when player not found in match data', async () => {
        const betId = betIdCounter++;
        mockGetBetById.mockResolvedValue({
            id: betId,
            playerName: 'testPlayer',
            status: 'pending',
            puuid: 'test-puuid',
            lastMatchId: 'match-1',
            betOnWin: true,
            amount: 100
        });

        mockGetMatchHistory.mockResolvedValue(['match-2', 'match-1']);
        mockGetMatchDetails.mockResolvedValue({
            info: {
                participants: [
                    { puuid: 'other-puuid', win: true }
                ]
            }
        });

        const result = await manualCheckBetStatus(betId, 'testPlayer');
        expect(result.success).toBe(false);
        expect(result.error).toBe('PLAYER_NOT_FOUND');
        expect(result.message).toContain('not found in match');
    });

    it('handles rate limit error from Riot API', async () => {
        const betId = betIdCounter++;
        mockGetBetById.mockResolvedValue({
            id: betId,
            playerName: 'testPlayer',
            status: 'pending',
            puuid: 'test-puuid',
            lastMatchId: 'match-1',
            betOnWin: true,
            amount: 100
        });

        mockGetMatchHistory.mockRejectedValue(new Error('rate limit exceeded'));

        const result = await manualCheckBetStatus(betId, 'testPlayer');
        expect(result.success).toBe(false);
        expect(result.error).toBe('RATE_LIMIT_EXCEEDED');
        expect(result.message).toContain('rate limit');
    });

    it('handles API authentication error', async () => {
        const betId = betIdCounter++;
        mockGetBetById.mockResolvedValue({
            id: betId,
            playerName: 'testPlayer',
            status: 'pending',
            puuid: 'test-puuid',
            lastMatchId: 'match-1',
            betOnWin: true,
            amount: 100
        });

        mockGetMatchHistory.mockRejectedValue(new Error('Riot API key rejected (401)'));

        const result = await manualCheckBetStatus(betId, 'testPlayer');
        expect(result.success).toBe(false);
        expect(result.error).toBe('API_REJECTED');
        expect(result.message).toContain('rejected');
    });
});
