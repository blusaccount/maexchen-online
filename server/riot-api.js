// ============== RIOT GAMES API ==============

const RIOT_API_KEY = process.env.RIOT_API_KEY || '';
const RIOT_REGION = process.env.RIOT_REGION || 'europe';
const RIOT_MAX_RETRIES = Math.max(0, Number(process.env.RIOT_API_MAX_RETRIES) || 2);
const RIOT_RETRY_BASE_MS = Math.max(50, Number(process.env.RIOT_API_RETRY_BASE_MS) || 250);

const VALID_REGIONS = ['americas', 'europe', 'asia', 'esports'];

// Set when API responds with 401/403 to prevent further futile calls
let riotApiDisabledReason = '';

/**
 * Parse a Riot ID string (e.g. "Player#EUW") into gameName and tagLine.
 * Returns null if the format is invalid.
 */
export function parseRiotId(riotId) {
    if (typeof riotId !== 'string') return null;
    const trimmed = riotId.trim();
    const hashIndex = trimmed.lastIndexOf('#');
    if (hashIndex < 1) return null;

    const gameName = trimmed.slice(0, hashIndex).trim();
    const tagLine = trimmed.slice(hashIndex + 1).trim();

    if (gameName.length < 3 || gameName.length > 16) return null;
    if (tagLine.length < 2 || tagLine.length > 5) return null;

    return { gameName, tagLine };
}

/**
 * Check whether the Riot API integration is configured.
 */
export function isRiotApiEnabled() {
    return RIOT_API_KEY.length > 0 && !riotApiDisabledReason;
}

/**
 * Returns a reason string if the API key was rejected (401/403), or empty string if OK.
 */
export function getRiotApiDisabledReason() {
    return riotApiDisabledReason;
}

/**
 * Look up a Riot account by Riot ID (gameName#tagLine).
 * Returns { puuid, gameName, tagLine } on success, or null if not found.
 * Throws on network/server errors.
 */
export async function lookupRiotAccount(gameName, tagLine) {
    const region = VALID_REGIONS.includes(RIOT_REGION) ? RIOT_REGION : 'europe';
    const url = `https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;

    const res = await fetch(url, {
        headers: { 'X-Riot-Token': RIOT_API_KEY }
    });

    if (res.status === 404) return null;
    if (res.status === 401 || res.status === 403) {
        riotApiDisabledReason = `Riot API key rejected (${res.status})`;
        throw new Error(riotApiDisabledReason);
    }
    if (res.status === 429) throw new Error('Riot API rate limit exceeded, try again later');
    if (!res.ok) throw new Error(`Riot API error (${res.status})`);

    const data = await res.json();
    return {
        puuid: data.puuid,
        gameName: data.gameName,
        tagLine: data.tagLine
    };
}

/**
 * Validate a Riot ID string end-to-end: parse it and look it up via the API.
 * Returns { valid: true, gameName, tagLine, puuid } or { valid: false, reason }.
 */
export async function validateRiotId(riotId) {
    const parsed = parseRiotId(riotId);
    if (!parsed) {
        return { valid: false, reason: 'Invalid format. Use Name#Tag (e.g. Player#EUW)' };
    }

    if (!isRiotApiEnabled()) {
        // Graceful degradation: accept any well-formatted ID when API key is missing
        return { valid: true, gameName: parsed.gameName, tagLine: parsed.tagLine, puuid: null };
    }

    try {
        const account = await lookupRiotAccount(parsed.gameName, parsed.tagLine);
        if (!account) {
            return { valid: false, reason: 'Riot account not found' };
        }
        return { valid: true, gameName: account.gameName, tagLine: account.tagLine, puuid: account.puuid };
    } catch (err) {
        throw err;
    }
}

/**
 * Get recent match IDs for a player by their PUUID.
 * Returns an array of match ID strings (e.g., ["EUW1_123456789", ...]).
 * Returns empty array if player not found or no matches.
 * Throws on network/server errors.
 */
export async function getMatchHistory(puuid, count = 5) {
    if (!puuid || typeof puuid !== 'string') {
        throw new Error('Valid PUUID is required');
    }
    
    const safeCount = Math.max(1, Math.min(100, Math.floor(count)));
    const region = VALID_REGIONS.includes(RIOT_REGION) ? RIOT_REGION : 'europe';
    const url = `https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?count=${safeCount}`;

    const res = await fetchWithRetry(url, {
        headers: { 'X-Riot-Token': RIOT_API_KEY }
    });

    if (res.status === 404) return [];
    if (res.status === 401 || res.status === 403) {
        riotApiDisabledReason = `Riot API key rejected (${res.status})`;
        throw new Error(riotApiDisabledReason);
    }
    if (res.status === 429) throw new Error('Riot API rate limit exceeded, try again later');
    if (!res.ok) throw new Error(`Riot API error (${res.status})`);

    const data = await res.json();
    return Array.isArray(data) ? data : [];
}

/**
 * Get match details by match ID.
 * Returns match info including participants with win/loss data.
 * Returns null if match not found.
 * Throws on network/server errors.
 */
export async function getMatchDetails(matchId) {
    if (!matchId || typeof matchId !== 'string') {
        throw new Error('Valid match ID is required');
    }

    const region = VALID_REGIONS.includes(RIOT_REGION) ? RIOT_REGION : 'europe';
    const url = `https://${region}.api.riotgames.com/lol/match/v5/matches/${encodeURIComponent(matchId)}`;

    const res = await fetchWithRetry(url, {
        headers: { 'X-Riot-Token': RIOT_API_KEY }
    });

    if (res.status === 404) return null;
    if (res.status === 401 || res.status === 403) {
        riotApiDisabledReason = `Riot API key rejected (${res.status})`;
        throw new Error(riotApiDisabledReason);
    }
    if (res.status === 429) throw new Error('Riot API rate limit exceeded, try again later');
    if (!res.ok) throw new Error(`Riot API error (${res.status})`);

    const data = await res.json();
    return data;
}

function isTransientStatus(status) {
    return status === 502 || status === 503 || status === 504;
}

function isRetryableFetchError(err) {
    const msg = String(err?.message || '').toLowerCase();
    return msg.includes('fetch failed') || msg.includes('network') || msg.includes('timeout') || msg.includes('socket');
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options) {
    let lastErr = null;

    for (let attempt = 0; attempt <= RIOT_MAX_RETRIES; attempt++) {
        try {
            const res = await fetch(url, options);
            if (isTransientStatus(res.status) && attempt < RIOT_MAX_RETRIES) {
                await delay(RIOT_RETRY_BASE_MS * (attempt + 1));
                continue;
            }
            return res;
        } catch (err) {
            lastErr = err;
            if (!isRetryableFetchError(err) || attempt >= RIOT_MAX_RETRIES) {
                throw err;
            }
            await delay(RIOT_RETRY_BASE_MS * (attempt + 1));
        }
    }

    throw lastErr || new Error('Riot API request failed');
}
